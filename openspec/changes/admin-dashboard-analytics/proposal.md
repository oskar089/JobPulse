# Proposal: Admin Dashboard + Analytics

## Intent

The application has rich data (pipeline runs, applications, jobs, portals) but no way to observe system health or performance at scale. There is no admin role, no analytics aggregation, and no visibility into portal performance or conversion rates. This change adds role-based admin access and an analytics dashboard so operators can monitor and manage the system.

## Scope

### In Scope
1. Add `role` column to User model (default: `"user"`, values: `"user" | "admin"`) with Alembic migration
2. Admin role-check dependency (FastAPI `Depends`) applied to `/admin/*` routes
3. `/admin/analytics` endpoint returning aggregated metrics: pipeline success rate, jobs scraped per portal (time-series), applications submitted (time-series), conversion rates, portal performance stats
4. `/admin/users` endpoint: list all users, toggle admin role
5. Admin dashboard page (`/admin`) with Recharts: overview cards, time-series charts, portal performance comparison, application status breakdown
6. Admin API client functions in frontend `lib/`
7. Route guard: redirect non-admin users away from `/admin`

### Out of Scope
- Separate analytics service or event-driven collection
- Audit logging for admin actions
- Advanced user management (CRUD, impersonation, suspension)
- Real-time WebSocket analytics
- Data partitioning or time-series optimization for scale
- Custom date range filtering (MVP uses fixed windows: 7d / 30d / 90d)
- Portal configuration management via admin UI

## Capabilities

### New Capabilities
- `admin-analytics`: Backend aggregation endpoints and frontend dashboard page for system-wide metrics and portal performance
- `admin-user-management`: Admin endpoints and UI for listing users and toggling admin role

### Modified Capabilities
- `user-auth`: User model gains `role` field; JWT payload includes role; auth dependency gains admin-check variant
- `dashboard`: Admin users see an "Admin" nav link and admin dashboard page; existing user dashboard unchanged
- `api-security`: Admin routes require role-based access control; non-admin requests to `/admin/*` return 403

## Approach

**Approach 1: Admin role + dedicated admin endpoints.** Add a `role` column to the existing `User` model (single migration). Create a reusable `require_admin` dependency. Admin endpoints live under a `/admin` prefix with their own router. Frontend adds a Recharts-based admin page behind a route guard. Aggregation queries run directly against existing tables (no new tables needed for MVP).

Chart library: **Recharts** — React-native, TypeScript-first, lightweight, consistent with existing stack.

Analytics aggregation: SQL `GROUP BY` with `date_trunc` for time-series, computed server-side. Fixed windows (7d/30d/90d) to keep MVP simple.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/app/models/user.py` | Modified | Add `role` column with default |
| `backend/alembic/versions/` | New | Migration for role column |
| `backend/app/auth/` | Modified | Admin role-check dependency, JWT role claim |
| `backend/app/routers/admin.py` | New | Analytics + user management endpoints |
| `backend/app/main.py` | Modified | Register admin router |
| `frontend/src/pages/AdminDashboard.tsx` | New | Admin analytics page |
| `frontend/src/pages/AdminUsers.tsx` | New | User management page |
| `frontend/src/components/charts/` | New | Reusable Recharts wrapper components |
| `frontend/src/lib/admin.ts` | New | Admin API client functions |
| `frontend/src/App.tsx` | Modified | Admin routes with role guard |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Aggregation queries slow on large datasets | Medium | Add indexes on `created_at` + `status` columns; paginate time windows |
| Admin endpoints exposed without proper checks | Low | `require_admin` dependency on every admin route; 403 for non-admin |
| Recharts bundle size impact | Low | Lazy-load admin page; tree-shakeable imports |
| Scope creep into full admin panel | Medium | Strict MVP boundary — list/toggle users only, no CRUD |

## Rollback Plan

1. **Migration rollback**: `alembic downgrade` to remove `role` column (column has no foreign keys, safe to drop)
2. **Code rollback**: Revert the commits adding admin router, admin pages, and role dependency — no existing endpoints are modified, only extended
3. **Data**: The `role` column defaults to `"user"`, so existing users are unaffected. No data migration needed

## Dependencies

- Existing User model and Alembic migration infrastructure
- Existing auth middleware (JWT validation, session management)
- Existing TanStack Query patterns in frontend
- PostgreSQL (for `date_trunc` and aggregation queries)

## Success Criteria

- [ ] User model has `role` column with `"user"` / `"admin"` values
- [ ] Non-admin users receive 403 on all `/admin/*` endpoints
- [ ] Admin analytics endpoint returns pipeline success rate, portal time-series, and conversion rates
- [ ] Admin dashboard renders overview cards and Recharts visualizations
- [ ] Admin can list users and toggle admin role
- [ ] Existing user dashboard and all non-admin features unchanged
- [ ] All existing tests pass; new admin endpoint tests added
