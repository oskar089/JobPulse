## Exploration: Admin Dashboard + Analytics

### Current State

**Existing Data Assets:**
- **PipelineRun**: status (pending/scraping/matching/applying/notifying/completed/failed/cancelled), portal_id, created_at, completed_at, error_step, error_msg, trigger
- **Application**: status (pending/applying/submitted/failed), match_score, cover_letter_generated, submitted_at, error_message, created_at
- **StoredJob**: portal_id, title, company, location, salary_range, scraped_at, posted_at
- **ScrapeSession**: portal_id, status (running/completed/failed), jobs_found, started_at, completed_at
- **Portal**: name, is_enabled, is_verified, scrape_interval_min, is_builtin
- **User**: email, name, created_at (no role field)

**Existing Endpoints:**
- `/pipeline/latest` - user's 10 most recent runs with portal name/status
- `/applications` - user's applications with filter by status
- `/jobs/` - stored jobs visible to user
- `/health` - DB/Redis/Celery health check (existing)

**Existing Frontend:**
- `Dashboard.tsx` - basic user dashboard with stats: jobs found, active portals, searches count, match average (hardcoded "--")
- UI components: Card, Badge, Button, Input, Modal, Toggle
- TanStack Query for data fetching with polling

**What's Missing:**
- No admin role or role-based access control
- No analytics aggregation endpoints
- No time-series data collection
- No system health monitoring beyond basic health check
- No user management capabilities
- No portal performance metrics

### Affected Areas

- `backend/app/models/user.py` — needs role field (admin/user)
- `backend/app/auth/router.py` — needs admin role checks
- `backend/app/main.py` — needs admin router registration
- `frontend/src/pages/Dashboard.tsx` — needs admin analytics views
- `frontend/src/components/` — needs chart components (recharts or similar)
- `frontend/src/lib/` — needs admin API functions

### Approaches

1. **Add admin role to User model + admin-only endpoints**
   - Add `role` column to User model (default: "user")
   - Create `/admin/*` endpoints with role checks
   - Frontend: admin dashboard page with charts
   - Effort: Medium

2. **Create separate analytics service**
   - New FastAPI service for analytics
   - Dedicated analytics database/tables
   - Event-driven collection via Celery tasks
   - Effort: High

3. **Extend existing endpoints with aggregation**
   - Add analytics queries to existing endpoints
   - No new service needed
   - Frontend: enhanced dashboard with charts
   - Effort: Low-Medium

### Recommendation

**Approach 1 (Admin role + admin endpoints)** is recommended because:
- Provides clear separation of concerns
- Enables future admin features (user management, system config)
- Maintains security with role-based access
- Moderate effort with high value

**MVP Scope:**
1. Add `role` field to User model (migration needed)
2. Create admin middleware for role checks
3. Create `/admin/analytics` endpoint with:
   - Pipeline success rate (completed vs total)
   - Jobs scraped per portal (time-series)
   - Applications submitted (time-series)
   - Conversion rates (applications / jobs scraped)
   - Portal performance (success rate, avg jobs per scrape)
4. Create admin dashboard page with:
   - Overview cards (total users, total jobs, success rate)
   - Time-series charts (pipeline runs, applications over time)
   - Portal performance comparison
   - Application status breakdown
5. Basic user management (list users, toggle admin role)

### Risks

- **Performance**: Aggregation queries on large datasets may be slow without proper indexing
- **Security**: Admin endpoints must be strictly protected (role checks, audit logging)
- **Scope creep**: Analytics can expand indefinitely - must define clear MVP
- **Data volume**: Time-series queries may need partitioning for scale
- **Frontend complexity**: Chart libraries add bundle size and learning curve

### Ready for Proposal

**Yes** — Clear path forward with:
- Existing data models provide most needed metrics
- Admin role is straightforward addition
- Frontend has TanStack Query + React patterns established
- MVP scope is well-defined and achievable

**Key Decisions Needed:**
1. Chart library choice (recharts vs chart.js vs victory)
2. Admin dashboard layout (separate page vs tab in existing dashboard)
3. Analytics granularity (daily/weekly/monthly aggregation)
4. User management scope (just list/toggle admin vs full CRUD)

### Estimated Scope

- **Files affected**: ~15-20 files
  - Backend: 5-7 new/modified files
  - Frontend: 8-10 new/modified files
  - Migrations: 1 new migration
- **Line count**: ~800-1200 lines total
  - Backend: ~400-600 lines
  - Frontend: ~400-600 lines
- **Time estimate**: 2-3 sessions for MVP