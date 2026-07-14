# Admin User Management Specification

## Purpose

Provide admin endpoints and UI for listing users and toggling admin role assignments.

## Requirements

### Requirement: User List Endpoint

The system MUST expose a `GET /admin/users` endpoint that returns a paginated list of all users with id, email, name, role, and created_at.

#### Scenario: Successful user list

- GIVEN 25 registered users exist
- WHEN an admin requests GET /admin/users?page=1&limit=20
- THEN the system returns 20 users with pagination metadata (total, page, pages)

#### Scenario: Empty user list

- GIVEN no users exist
- WHEN an admin requests GET /admin/users
- THEN the system returns an empty array with total of 0

### Requirement: User Role Toggle

The system MUST expose a `PATCH /admin/users/{user_id}/role` endpoint that toggles a user's role between "user" and "admin".

#### Scenario: Promote user to admin

- GIVEN a user with role "user"
- WHEN an admin sends PATCH /admin/users/{id}/role with body {"role": "admin"}
- THEN the system updates the user's role to "admin" and returns the updated user

#### Scenario: Demote admin to user

- GIVEN a user with role "admin"
- WHEN an admin sends PATCH /admin/users/{id}/role with body {"role": "user"}
- THEN the system updates the user's role to "user" and returns the updated user

#### Scenario: Prevent self-demotion

- GIVEN an admin targeting their own user ID
- WHEN they attempt to change their own role
- THEN the system MUST reject with 400 and message "Cannot change your own role"

#### Scenario: Invalid role value

- GIVEN an admin sends role: "superadmin"
- WHEN the system validates the request
- THEN it MUST reject with 400 and message indicating valid values are "user" or "admin"

#### Scenario: Non-existent user

- GIVEN no user with the specified ID exists
- WHEN an admin attempts to toggle role
- THEN the system MUST return 404

### Requirement: Admin User Management Frontend

The system MUST display a user management page at `/admin/users` listing all users in a table with name, email, role badge, and a toggle button to change role.

#### Scenario: Admin views user list

- GIVEN an authenticated admin user
- WHEN the admin navigates to /admin/users
- THEN the page renders a table of users with role badges and action buttons

#### Scenario: Toggle user role from UI

- GIVEN the admin sees a user with "user" role badge
- WHEN the admin clicks the promote button
- THEN the role badge updates to "admin" and a success toast is shown
