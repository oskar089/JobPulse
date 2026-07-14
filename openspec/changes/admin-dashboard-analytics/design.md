# Design: Admin Dashboard + Analytics

## Return Envelope

| Field | Value |
|-------|-------|
| status | success |
| executive_summary | Technical design for Admin Dashboard + Analytics. Role column on User + SQL aggregation + Recharts admin pages behind JWT role gate. 5 architecture decisions documented, 16 file changes, complete SQL queries and interface contracts. |
| artifacts | `openspec/changes/admin-dashboard-analytics/design.md`, engram `sdd/admin-dashboard-analytics/design` |
| next_recommended | sdd-tasks |
| risks | Aggregation query performance on large datasets (mitigated with indexes + fixed time windows) |
| skill_resolution | none — no additional skills required |

## Technical Approach

Add a `role` column to the existing `User` model, embed it in JWT payloads, and gate all `/admin/*` routes via a `require_admin` FastAPI dependency. Backend analytics are computed as SQL aggregations (GROUP BY + date_trunc) against existing `pipeline_run`, `stored_job`, and `application` tables — no new tables needed. Frontend adds Recharts-based admin pages behind role-based route guards, using the existing TanStack Query + Layout patterns.

## Architecture Decisions

| Decision | Option A | Option B | Tradeoff | Decision |
|----------|----------|----------|----------|----------|
| Role storage | Column on User table | Separate Role table + FK | Column is simpler, one migration, no JOIN needed for every auth check. Role table only if roles become complex (permissions, scopes). MVP has exactly 2 roles. | Column on User |
| Analytics computation | Real-time SQL aggregation | Pre-computed materialized view / cache | SQL aggregation is simpler for MVP with fixed windows. Materialized view adds refresh complexity. Data volume is small (thousands, not millions of rows). | Real-time SQL |
| Chart library | Recharts | Chart.js + react-chartjs-2 | Recharts is React-native, TypeScript-first, lighter bundle, consistent with existing stack philosophy. | Recharts |
| Admin role in JWT | Include `role` claim in access token | Fetch role from DB on every request | JWT claim avoids DB hit on every admin check. Role changes require token refresh (acceptable — rare operation). | JWT claim |
| Route protection | Per-route dependency | Router-level middleware | Per-route `require_admin` is explicit, matches existing dependency injection pattern, easier to test. | Per-route dependency |

## Data Flow

### Analytics Request Flow

```
Browser ──GET /admin/analytics?window=30d──→ FastAPI Admin Router
                                                  │
                                          require_admin (JWT role check)
                                                  │
                                          Admin Service Layer
                                                  │
                                    ┌─────────────┼──────────────┐
                                    │             │              │
                              pipeline_run    stored_job    application
                              GROUP BY       GROUP BY       GROUP BY
                              status,        portal_id,    date_trunc
                              date_trunc     date_trunc    (created_at)
                                    │             │              │
                                    └─────────────┼──────────────┘
                                                  │
                                          Merge into AnalyticsResponse
                                                  │
                                            JSON Response
```

### Admin Role Check Flow

```
Request ──→ get_token (cookie/header) ──→ decode JWT ──→ extract "role" claim
                                                               │
                                              role == "admin" ─┤
                                                               │
                                                     yes ──→ pass (return user_id)
                                                     no  ──→ 403 "Admin access required"
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/app/models/user.py` | Modify | Add `role` column: `String(20), default="user", nullable=False` |
| `backend/alembic/versions/20260714_XXXXXX_add_user_role.py` | Create | Migration: add `role` column with server default `"user"`, backfill existing rows |
| `backend/app/auth/utils.py` | Modify | `create_access_token` accepts `role` param, includes `{"role": role}` in JWT payload |
| `backend/app/auth/schemas.py` | Modify | Add `role: str` to `UserResponse`; create `AdminUserResponse`, `RoleUpdateRequest`, `AnalyticsResponse`, `UserListResponse` schemas |
| `backend/app/auth/router.py` | Modify | Pass `user.role` to `create_access_token`/`create_refresh_token` in login/register/refresh |
| `backend/app/auth/dependencies.py` | Create | Shared auth dependencies: `require_admin` (JWT role check) |
| `backend/app/routers/admin.py` | Create | Admin router: `GET /admin/analytics`, `GET /admin/users`, `PATCH /admin/users/{id}/role` |
| `backend/app/main.py` | Modify | Import and register admin router with `prefix=settings.api_prefix` |
| `frontend/src/types/index.ts` | Modify | Add `role` to `UserResponse`; add `AdminAnalytics`, `AdminUser`, `UserListResponse` types |
| `frontend/src/lib/admin.ts` | Create | API client: `getAdminAnalytics(window)`, `getAdminUsers(page, limit)`, `toggleUserRole(userId, role)` |
| `frontend/src/pages/AdminDashboard.tsx` | Create | Admin analytics page with stat cards + Recharts visualizations |
| `frontend/src/pages/AdminUsers.tsx` | Create | User management page with table + role toggle |
| `frontend/src/components/AdminRoute.tsx` | Create | Route guard: checks `user.role === "admin"`, redirects to `/dashboard` if not |
| `frontend/src/App.tsx` | Modify | Add `/admin` and `/admin/users` routes wrapped in `AdminRoute` |
| `frontend/src/components/Layout.tsx` | Modify | Conditionally render "Admin" nav link when `user.role === "admin"` |
| `frontend/package.json` | Modify | Add `recharts` dependency |

## Interfaces / Contracts

### Backend: require_admin dependency

```python
async def require_admin(
    token: str = Depends(get_token_from_header),
) -> str:
    """Extract role from JWT claim, raise 403 if not admin."""
    payload = decode_jwt(token)
    role = payload.get("role", "user")
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload["sub"]  # user_id
```

Placed in `backend/app/auth/dependencies.py` (new file for shared auth dependencies). Reads role directly from JWT token — no DB lookup needed. Matches architecture decision "JWT claim" and spec requirement "extracts the user's role from the JWT token".

**Note**: Role changes take effect on next login/refresh when a new JWT is issued with updated role claim. This is acceptable for rare admin role changes.

### Backend: Analytics response schema

```python
class AnalyticsResponse(BaseModel):
    pipeline: PipelineMetrics       # total_runs, success_rate, completed, failed
    jobs: JobsMetrics               # total_scraped, jobs_by_portal (time-series)
    applications: ApplicationsMetrics  # total_submitted, timeseries
    portals: list[PortalPerformance]   # per-portal stats
    conversion_rate: float
    window: str

class PipelineMetrics(BaseModel):
    total_runs: int
    success_rate: float
    completed: int
    failed: int

class PortalTimeSeries(BaseModel):
    date: str
    count: int

class JobsMetrics(BaseModel):
    total_scraped: int
    by_portal: dict[str, list[PortalTimeSeries]]

class ApplicationsMetrics(BaseModel):
    total_submitted: int
    timeseries: list[PortalTimeSeries]

class PortalPerformance(BaseModel):
    portal_name: str
    jobs_found: int
    applications_submitted: int
    success_rate: float
```

### Backend: Admin user management schemas

```python
class AdminUserResponse(BaseModel):
    id: str
    email: str
    name: str | None
    role: str
    created_at: str

class UserListResponse(BaseModel):
    users: list[AdminUserResponse]
    total: int
    page: int
    pages: int

class RoleUpdateRequest(BaseModel):
    role: Literal["user", "admin"]
```

### Frontend: TypeScript types

```typescript
interface AdminAnalytics {
  pipeline: { total_runs: number; success_rate: number; completed: number; failed: number };
  jobs: { total_scraped: number; by_portal: Record<string, Array<{ date: string; count: number }>> };
  applications: { total_submitted: number; timeseries: Array<{ date: string; count: number }> };
  portals: Array<{ portal_name: string; jobs_found: number; applications_submitted: number; success_rate: number }>;
  conversion_rate: number;
  window: string;
}

interface AdminUser {
  id: string; email: string; name: string | null; role: string; created_at: string;
}

interface UserListResponse {
  users: AdminUser[]; total: number; page: number; pages: number;
}
```

## SQL Aggregation Queries

### Pipeline success rate

```sql
SELECT
  COUNT(*) as total_runs,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  CASE WHEN COUNT(*) > 0
    THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*), 1)
    ELSE 0 END as success_rate
FROM pipeline_run
WHERE created_at >= NOW() - INTERVAL '30 days';
```

### Jobs by portal (time-series)

```sql
SELECT p.name as portal_name,
       date_trunc('day', sj.scraped_at)::date as day,
       COUNT(*) as count
FROM stored_job sj
JOIN portal p ON sj.portal_id = p.id
WHERE sj.scraped_at >= NOW() - INTERVAL '30 days'
GROUP BY p.name, day
ORDER BY day;
```

### Applications time-series

```sql
SELECT date_trunc('day', created_at)::date as day, COUNT(*) as count
FROM application
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY day ORDER BY day;
```

### Portal performance

```sql
SELECT p.name as portal_name,
       COUNT(DISTINCT sj.id) as jobs_found,
       COUNT(DISTINCT a.id) as applications_submitted,
       ROUND(100.0 * COUNT(DISTINCT a.id) / GREATEST(COUNT(DISTINCT sj.id), 1), 1) as success_rate
FROM portal p
LEFT JOIN stored_job sj ON sj.portal_id = p.id AND sj.scraped_at >= NOW() - INTERVAL '30 days'
LEFT JOIN application a ON a.stored_job_id = sj.id AND a.created_at >= NOW() - INTERVAL '30 days'
GROUP BY p.name;
```

## Key Flows

### Analytics Aggregation Sequence

```
Admin clicks /admin
  → AdminDashboard.tsx mounts
  → useQuery(["admin-analytics", window], getAdminAnalytics)
  → GET /api/admin/analytics?window=30d
  → require_admin checks JWT role
  → 4 SQL queries (parallel via asyncio.gather)
  → Merge into AnalyticsResponse
  → JSON → Recharts renders charts
```

### User Role Toggle Sequence

```
Admin clicks "Promote" on user row
  → toggleUserRole(userId, "admin")
  → PATCH /api/admin/users/{userId}/role { role: "admin" }
  → require_admin checks JWT role
  → Check target userId != current user (prevent self-demotion)
  → UPDATE "user" SET role = 'admin' WHERE id = userId
  → Return updated AdminUserResponse
  → TanStack query invalidates ["admin-users"]
  → Table re-renders with new role badge
```

## Security Model

1. **Authentication**: Existing JWT cookie/header dual auth unchanged
2. **Authorization**: `require_admin` dependency chains after `get_token`:
   - 401 if no valid JWT (handled by `get_token`)
   - 403 if `role` claim != "admin"
3. **Self-demotion guard**: `PATCH /admin/users/{id}/role` checks `id != current_user_id`
4. **Frontend guard**: `AdminRoute` component checks `user.role === "admin"` before rendering child routes
5. **JWT role claim**: Embedded in access token; changes take effect on next login/refresh (acceptable for rare admin role changes)

## Performance Considerations

- **Indexes**: Add composite index on `pipeline_run(created_at, status)` and `stored_job(scraped_at, portal_id)` and `application(created_at)` to support time-range aggregation queries
- **Query parallelism**: Execute all 4 analytics SQL queries via `asyncio.gather` to reduce response latency
- **No caching for MVP**: Aggregation queries run against existing tables. Volume is small enough (< 100k rows). Add Redis caching only if p95 latency exceeds 500ms
- **Recharts lazy-load**: Admin pages are only loaded for admin users — small impact on main bundle. Recharts is tree-shakeable

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `require_admin` dependency, role extraction, 403 logic | pytest with mocked JWT payloads |
| Unit | Analytics query functions, edge cases (empty data, zero division) | pytest with in-memory SQLite or test DB |
| Unit | Admin schemas validation (invalid role, self-demotion) | pytest pydantic validation |
| Integration | Full `/admin/analytics` endpoint with seeded data | pytest + test database, verify response schema |
| Integration | Full `/admin/users` endpoint, pagination, role toggle | pytest + test database |
| E2E | Admin dashboard renders, non-admin redirected, role toggle works | Playwright (stretch goal) |

## Migration / Rollout

1. **Alembic migration**: Add `role` column to `user` table with `server_default="user"`. Backfill existing rows (UPDATE user SET role = 'user' WHERE role IS NULL). Drop default after backfill.
2. **Backward compatibility**: Existing JWTs without `role` claim will fail `require_admin` (expected — they need re-login to get role in token). Non-admin routes are unaffected.
3. **No feature flag needed**: Admin endpoints are protected by role check; non-admin users get 403. No risk of exposure.

## Open Questions

- [ ] Should the first registered user automatically get `admin` role? (Currently: all new users get "user" — admin must be promoted via API or DB)
- [ ] Recharts package size: ~40KB gzipped. Acceptable or prefer lighter alternative (e.g., uPlot)?
