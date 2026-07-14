# Delta for Dashboard

## ADDED Requirements

### Requirement: Admin Navigation Link

The system MUST display an "Admin" navigation link in the main dashboard nav for users with role "admin". The link MUST NOT be visible to non-admin users.

#### Scenario: Admin sees admin link

- GIVEN an authenticated user with role "admin"
- WHEN the user views the dashboard navigation
- THEN an "Admin" link is visible pointing to /admin

#### Scenario: Non-admin does not see admin link

- GIVEN an authenticated user with role "user"
- WHEN the user views the dashboard navigation
- THEN no "Admin" link is visible

### Requirement: Admin Dashboard Page

The system MUST provide an admin dashboard page at `/admin` accessible only to admin users. The page MUST display overview metric cards (total pipeline runs, success rate, total applications, conversion rate) and time-series charts (jobs by portal, applications over time) using Recharts. Non-admin users accessing `/admin` MUST be redirected to the main dashboard.

#### Scenario: Admin views dashboard

- GIVEN an authenticated admin user
- WHEN the admin navigates to /admin
- THEN the page renders overview stat cards and Recharts charts for pipeline, portal, and application metrics

#### Scenario: Non-admin redirected from /admin

- GIVEN an authenticated user with role "user"
- WHEN the user navigates to /admin
- THEN the system redirects to / (main dashboard)

#### Scenario: Unauthenticated access to /admin

- GIVEN no valid session
- WHEN the user navigates to /admin
- THEN the system redirects to the login page
