# Delta for User Auth

## ADDED Requirements

### Requirement: Admin Role Check Dependency

The system MUST provide a reusable FastAPI dependency (`require_admin`) that extracts the user's role from the JWT token and returns 403 Forbidden if the role is not "admin".

#### Scenario: Admin passes role check

- GIVEN an authenticated user with role "admin" in their JWT
- WHEN the request hits a route protected by require_admin
- THEN the dependency passes and the route handler executes

#### Scenario: Non-admin blocked by role check

- GIVEN an authenticated user with role "user" in their JWT
- WHEN the request hits a route protected by require_admin
- THEN the system MUST return 403 Forbidden with message "Admin access required"

#### Scenario: Unauthenticated request to admin route

- GIVEN a request with no valid JWT token
- WHEN the request hits a route protected by require_admin
- THEN the system MUST return 401 Unauthorized

## MODIFIED Requirements

### Requirement: User Registration

The system MUST allow a new user to register with a valid email address and password. The system MUST rate-limit registration requests to 10 per minute per IP. The system MUST assign a default role of "user" to all new registrations.
(Previously: User registration without rate limiting and without role assignment)

#### Scenario: Successful registration

- GIVEN the user provides a valid email, password (min 8 chars, one uppercase, one number), and optional name
- WHEN the user submits the registration form
- THEN the system creates the account with a hashed password and role set to "user"
- AND returns a confirmation to the user

#### Scenario: Duplicate email registration

- GIVEN a user with email "user@example.com" already exists
- WHEN another user attempts to register with the same email
- THEN the system MUST reject the registration with a clear error message

#### Scenario: Weak password

- GIVEN the user provides a password shorter than 8 characters or lacking required complexity
- WHEN the user submits the registration form
- THEN the system MUST reject with a password policy error

#### Scenario: Rate-limited registration

- GIVEN an IP that has made 10 or more registration attempts in the last minute
- WHEN the user submits another registration from the same IP
- THEN the system MUST return 429 Too Many Requests response

### Requirement: Session Management

The system MUST maintain authenticated sessions with JWT-based expiry, refresh rotation, and token blacklisting. Access tokens MUST expire after 15 minutes. Refresh tokens MUST expire after 7 days. The JWT payload MUST include the user's role as a "role" claim.
(Previously: Session management with configurable expiry and refresh support without rotation, no role in JWT)

#### Scenario: Access token expiry

- GIVEN an authenticated user with an expired access token
- WHEN the user makes an API request
- THEN the system MUST reject with a 401 status code

#### Scenario: Token refresh with rotation

- GIVEN an authenticated user with a valid refresh token
- WHEN the user requests a new access token
- THEN the system MUST issue a new access token and a new refresh token
- AND blacklist the previous refresh token

#### Scenario: Reused refresh token detected

- GIVEN a refresh token that was already rotated (blacklisted)
- WHEN a client attempts to use it
- THEN the system MUST reject with a 401 status code
- AND invalidate all refresh tokens for that user (potential token theft)

#### Scenario: Logout invalidates refresh token

- GIVEN an authenticated user with a valid refresh token
- WHEN the user calls the logout endpoint
- THEN the system MUST blacklist the refresh token immediately

#### Scenario: JWT contains role claim

- GIVEN a user with role "admin"
- WHEN the system issues a JWT token
- THEN the token payload MUST include {"role": "admin"}
