# Tasks: Admin Dashboard + Analytics

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 450–550 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (backend) → PR 2 (frontend) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Backend: migration + auth role + admin router + tests | PR 1 | base: main; ~250 lines |
| 2 | Frontend: types + API client + admin pages + guards | PR 2 | base: PR 1 branch or main; ~200 lines; depends on PR 1 for role in UserResponse |

---

## Phase 1: Database & Model (Foundation)

- [x] 1.1 Add `role: Mapped[str]` column to `backend/app/models/user.py` — `String(20), default="user", nullable=False`
- [x] 1.2 Create `backend/alembic/versions/20260714_add_user_role.py` — add `role` column with `server_default="user"`, backfill existing rows with `UPDATE "user" SET role='user' WHERE role IS NULL`, add composite indexes on `pipeline_run(created_at, status)`, `stored_job(scraped_at, portal_id)`, `application(created_at)`

## Phase 2: Backend Auth Changes

- [x] 2.1 TDD RED: Write failing test in `backend/tests/test_auth.py` — verify `create_access_token("uid", role="admin")` includes `{"role": "admin"}` in JWT payload
- [x] 2.2 Modify `backend/app/auth/utils.py` — add `role: str = "user"` param to `create_access_token` and `create_refresh_token`, include `{"role": role}` in payload
- [x] 2.3 TDD GREEN: make 2.1 test pass
- [x] 2.4 Add `role: str` field to `UserResponse` in `backend/app/auth/schemas.py`, `from_attributes=True`
- [x] 2.5 Pass `user.role` to `create_access_token`/`create_refresh_token` in `register`, `login`, and `refresh_token` endpoints in `backend/app/auth/router.py`

## Phase 3: Backend Admin Router

- [x] 3.1 Add admin schemas to `backend/app/auth/schemas.py`: `AdminUserResponse`, `UserListResponse`, `RoleUpdateRequest`, `AnalyticsResponse` (+ nested `PipelineMetrics`, `JobsMetrics`, `ApplicationsMetrics`, `PortalPerformance`, `PortalTimeSeries`)
- [x] 3.2 Add `require_admin` dependency in `backend/app/auth/router.py` — extracts role from JWT via `decode_access_token`, returns 403 if not `"admin"`; chains after `get_current_user_id`
- [x] 3.3 TDD RED: Write failing tests in `backend/tests/test_admin.py` — test `require_admin` with admin JWT (pass), non-admin JWT (403), no token (401)
- [x] 3.4 Create `backend/app/routers/admin.py` with router `prefix="/admin"`:
  - `GET /analytics?window=30d` — 4 parallel SQL aggregations via `asyncio.gather`, returns `AnalyticsResponse`
  - `GET /users?page=1&limit=20` — paginated user list with `AdminUserResponse`
  - `PATCH /users/{user_id}/role` — self-demotion guard (`id != current_user_id`), validates role in `["user", "admin"]`, returns updated user
- [x] 3.5 TDD GREEN: make 3.3 tests pass; add tests for all 3 endpoints (analytics window validation, pagination, role toggle, self-demotion, 404 on missing user)
- [x] 3.6 Register admin router in `backend/app/main.py` — `app.include_router(admin_router, prefix=settings.api_prefix)`

## Phase 4: Frontend Types & API Client

- [ ] 4.1 Add `role: string` to `UserResponse` in `frontend/src/types/index.ts`; add `AdminAnalytics`, `AdminUser`, `UserListResponse` interfaces
- [ ] 4.2 Create `frontend/src/lib/admin.ts` — `getAdminAnalytics(window)`, `getAdminUsers(page, limit)`, `toggleUserRole(userId, role)` using existing `api()` helper

## Phase 5: Frontend Admin Pages

- [ ] 5.1 Create `frontend/src/components/AdminRoute.tsx` — checks `user.role === "admin"`, redirects to `/` if not; wraps `<Outlet />`
- [ ] 5.2 Create `frontend/src/pages/AdminDashboard.tsx` — stat cards (total runs, success rate, total apps, conversion rate) + Recharts `LineChart` (time-series) + `BarChart` (portal comparison); uses `useQuery(["admin-analytics", window], getAdminAnalytics)`
- [ ] 5.3 Create `frontend/src/pages/AdminUsers.tsx` — table with columns (name, email, role badge, action button); uses `useQuery(["admin-users", page], getAdminUsers)` + `useMutation` for `toggleUserRole` with query invalidation
- [ ] 5.4 Add `/admin` and `/admin/users` routes in `frontend/src/App.tsx` wrapped in `<AdminRoute>`
- [ ] 5.5 Conditionally render "Admin" nav link in `frontend/src/components/Layout.tsx` when `user.role === "admin"` (use Shield icon from lucide-react)
- [ ] 5.6 Add `recharts` dependency in `frontend/package.json`

## Phase 6: Integration Tests

- [x] 6.1 Integration test: `GET /admin/analytics` with seeded pipeline_run, stored_job, application data — verify response schema and metric values
- [x] 6.2 Integration test: `GET /admin/users` with 25 seeded users — verify pagination (page=1, limit=20 returns 20 users, total=25)
- [x] 6.3 Integration test: `PATCH /admin/users/{id}/role` — promote user to admin, verify self-demotion blocked, verify 404 for non-existent user

---

## Execution Order Summary

```
Phase 1 (DB/Model) → Phase 2 (Auth Role) → Phase 3 (Admin Router) → Phase 4 (FE Types) → Phase 5 (FE Pages) → Phase 6 (Integration Tests)
```

All backend phases (1–3, 6) are **PR 1**. All frontend phases (4–5) are **PR 2**.

TDD cycle applies to Phases 2 and 3 (RED → GREEN → REFACTOR).
