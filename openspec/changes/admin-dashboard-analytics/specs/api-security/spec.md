# Delta for API Security

## ADDED Requirements

### Requirement: Admin Route Access Control

The system MUST protect all routes under the `/admin` prefix with the `require_admin` dependency. Non-admin users MUST receive a 403 Forbidden response. Unauthenticated requests MUST receive 401 Unauthorized.

#### Scenario: Non-admin accesses admin endpoint

- GIVEN an authenticated user with role "user"
- WHEN the user requests GET /admin/analytics
- THEN the system MUST return 403 with message "Admin access required"

#### Scenario: Unauthenticated admin access

- GIVEN a request with no valid JWT
- WHEN the user requests GET /admin/users
- THEN the system MUST return 401 Unauthorized

#### Scenario: Admin accesses admin endpoint

- GIVEN an authenticated user with role "admin"
- WHEN the user requests GET /admin/analytics
- THEN the system returns 200 with analytics data
