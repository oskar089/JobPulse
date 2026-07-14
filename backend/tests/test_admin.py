"""Tests for admin dependency and admin router endpoints.

Covers Phase 3 tasks (3.3, 3.5):
- 3.3: require_admin dependency (admin passes, non-admin blocked, unauthenticated blocked)
- 3.5: Endpoint tests for analytics, users list, role toggle
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient

from app.auth.utils import create_access_token


# ---------------------------------------------------------------------------
# Helper: create tokens with specific roles
# ---------------------------------------------------------------------------


def _admin_token(user_id: str | None = None) -> str:
    """Create an access token with role='admin'."""
    uid = user_id or str(uuid.uuid4())
    return create_access_token(subject=uid, role="admin")


def _user_token(user_id: str | None = None) -> str:
    """Create an access token with role='user'."""
    uid = user_id or str(uuid.uuid4())
    return create_access_token(subject=uid, role="user")


# ---------------------------------------------------------------------------
# Task 3.3: require_admin dependency
# ---------------------------------------------------------------------------


class TestRequireAdmin:
    """require_admin dependency: admin passes, non-admin gets 403, no token gets 401."""

    async def test_admin_passes_role_check(self, async_client: AsyncClient, test_user):
        """Admin user with role='admin' in JWT can access protected route."""
        token = _admin_token(user_id=test_user.id)
        response = await async_client.get(
            "/api/admin/users",
            headers={"Authorization": f"Bearer {token}"},
        )
        # Should NOT be 403 — admin passes the role check
        assert response.status_code != 403
        # Should be 200 (or at least not 401/403)
        assert response.status_code == 200

    async def test_non_admin_blocked_by_role_check(self, async_client: AsyncClient, test_user):
        """Non-admin user with role='user' gets 403."""
        token = _user_token(user_id=test_user.id)
        response = await async_client.get(
            "/api/admin/analytics",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403
        assert response.json()["detail"] == "Admin access required"

    async def test_unauthenticated_request_to_admin_route(self, async_client: AsyncClient):
        """Request with no JWT token gets 401."""
        response = await async_client.get("/api/admin/analytics")
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# Task 3.5: Analytics endpoint tests
# ---------------------------------------------------------------------------


class TestAdminAnalytics:
    """GET /admin/analytics with various scenarios."""

    async def test_analytics_empty_data_returns_zeros(self, async_client: AsyncClient, test_user):
        """With no data in the DB, analytics returns zero metrics."""
        token = _admin_token(user_id=test_user.id)
        response = await async_client.get(
            "/api/admin/analytics?window=30d",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["pipeline"]["total_runs"] == 0
        assert data["pipeline"]["success_rate"] == 0.0
        assert data["jobs"]["total_scraped"] == 0
        assert data["applications"]["total_submitted"] == 0
        assert data["conversion_rate"] == 0.0
        assert data["window"] == "30d"

    async def test_analytics_invalid_window_returns_400(self, async_client: AsyncClient, test_user):
        """Invalid window parameter returns 400."""
        token = _admin_token(user_id=test_user.id)
        response = await async_client.get(
            "/api/admin/analytics?window=invalid",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 400
        assert "Invalid window" in response.json()["detail"]

    async def test_analytics_response_schema(self, async_client: AsyncClient, test_user):
        """Response has all required schema fields."""
        token = _admin_token(user_id=test_user.id)
        response = await async_client.get(
            "/api/admin/analytics?window=7d",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        # Pipeline section
        assert "total_runs" in data["pipeline"]
        assert "success_rate" in data["pipeline"]
        assert "completed" in data["pipeline"]
        assert "failed" in data["pipeline"]
        # Jobs section
        assert "total_scraped" in data["jobs"]
        assert "by_portal" in data["jobs"]
        # Applications section
        assert "total_submitted" in data["applications"]
        assert "timeseries" in data["applications"]
        # Portals section
        assert isinstance(data["portals"], list)
        # Top-level
        assert "conversion_rate" in data
        assert "window" in data

    async def test_analytics_with_seeded_data(self, async_client: AsyncClient, db_session, test_user):
        """With seeded pipeline runs, metrics calculate correctly."""
        from app.models import PipelineRun, Portal, StoredJob, Application
        import uuid as _uuid

        # Create a portal
        portal_id = str(_uuid.uuid4())
        await db_session.execute(
            __import__("sqlalchemy").text(
                "INSERT INTO portal (id, name, base_url, job_listing_url, selectors, is_builtin, is_enabled, is_verified, scrape_interval_min) "
                "VALUES (:id, :name, :base_url, :job_url, '{}', 0, 1, 0, 60)"
            ),
            {"id": portal_id, "name": "LinkedIn", "base_url": "https://linkedin.com", "job_url": "https://linkedin.com/jobs"},
        )
        await db_session.flush()

        # Create 8 completed + 2 failed pipeline runs
        for i in range(8):
            pr_id = str(_uuid.uuid4())
            await db_session.execute(
                __import__("sqlalchemy").text(
                    "INSERT INTO pipeline_run (id, user_id, portal_id, status, trigger) "
                    "VALUES (:id, :uid, :pid, 'completed', 'manual')"
                ),
                {"id": pr_id, "uid": test_user.id, "pid": portal_id},
            )
        for i in range(2):
            pr_id = str(_uuid.uuid4())
            await db_session.execute(
                __import__("sqlalchemy").text(
                    "INSERT INTO pipeline_run (id, user_id, portal_id, status, trigger) "
                    "VALUES (:id, :uid, :pid, 'failed', 'manual')"
                ),
                {"id": pr_id, "uid": test_user.id, "pid": portal_id},
            )
        await db_session.flush()

        token = _admin_token(user_id=test_user.id)
        response = await async_client.get(
            "/api/admin/analytics?window=30d",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["pipeline"]["total_runs"] == 10
        assert data["pipeline"]["completed"] == 8
        assert data["pipeline"]["failed"] == 2
        assert data["pipeline"]["success_rate"] == 80.0


# ---------------------------------------------------------------------------
# Task 3.5: Users list endpoint tests
# ---------------------------------------------------------------------------


class TestAdminUsers:
    """GET /admin/users with pagination."""

    async def test_users_empty_list(self, async_client: AsyncClient, test_user):
        """With only the test user, returns 1 user with total=1."""
        token = _admin_token(user_id=test_user.id)
        response = await async_client.get(
            "/api/admin/users?page=1&limit=20",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert data["page"] == 1
        assert len(data["users"]) >= 1
        # Verify user fields
        user_data = data["users"][0]
        assert "id" in user_data
        assert "email" in user_data
        assert "role" in user_data
        assert "created_at" in user_data

    async def test_users_pagination(self, async_client: AsyncClient, db_session, test_user):
        """With 25 users, page=1 limit=20 returns 20, total=25."""
        import uuid as _uuid
        from app.auth.utils import hash_password

        # Seed 24 additional users
        for i in range(24):
            uid = str(_uuid.uuid4())
            await db_session.execute(
                __import__("sqlalchemy").text(
                    "INSERT INTO \"user\" (id, email, name, password_hash, role) "
                    "VALUES (:id, :email, :name, :pwd, 'user')"
                ),
                {
                    "id": uid,
                    "email": f"user-{i}-{_uuid.uuid4().hex[:6]}@example.com",
                    "name": f"User {i}",
                    "pwd": hash_password("TestPass123"),
                },
            )
        await db_session.flush()

        token = _admin_token(user_id=test_user.id)
        response = await async_client.get(
            "/api/admin/users?page=1&limit=20",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 25
        assert data["page"] == 1
        assert data["pages"] == 2
        assert len(data["users"]) == 20


# ---------------------------------------------------------------------------
# Task 3.5: Role toggle endpoint tests
# ---------------------------------------------------------------------------


class TestAdminRoleToggle:
    """PATCH /admin/users/{user_id}/role"""

    async def test_promote_user_to_admin(self, async_client: AsyncClient, db_session, test_user):
        """Promote a regular user to admin."""
        import uuid as _uuid
        from app.auth.utils import hash_password

        target_id = str(_uuid.uuid4())
        await db_session.execute(
            __import__("sqlalchemy").text(
                "INSERT INTO \"user\" (id, email, name, password_hash, role) "
                "VALUES (:id, :email, :name, :pwd, 'user')"
            ),
            {
                "id": target_id,
                "email": f"target-{_uuid.uuid4().hex[:6]}@example.com",
                "name": "Target User",
                "pwd": hash_password("TestPass123"),
            },
        )
        await db_session.flush()

        token = _admin_token(user_id=test_user.id)
        response = await async_client.patch(
            f"/api/admin/users/{target_id}/role",
            headers={"Authorization": f"Bearer {token}"},
            json={"role": "admin"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "admin"
        assert data["id"] == target_id

    async def test_prevent_self_role_change(self, async_client: AsyncClient, test_user):
        """Admin cannot change their own role."""
        token = _admin_token(user_id=test_user.id)
        response = await async_client.patch(
            f"/api/admin/users/{test_user.id}/role",
            headers={"Authorization": f"Bearer {token}"},
            json={"role": "user"},
        )
        assert response.status_code == 400
        assert "Cannot change your own role" in response.json()["detail"]

    async def test_nonexistent_user_returns_404(self, async_client: AsyncClient, test_user):
        """Updating role for non-existent user returns 404."""
        token = _admin_token(user_id=test_user.id)
        fake_id = str(__import__("uuid").uuid4())
        response = await async_client.patch(
            f"/api/admin/users/{fake_id}/role",
            headers={"Authorization": f"Bearer {token}"},
            json={"role": "admin"},
        )
        assert response.status_code == 404
        assert "User not found" in response.json()["detail"]

    async def test_invalid_role_value_rejected(self, async_client: AsyncClient, db_session, test_user):
        """Invalid role value is rejected by Pydantic validation."""
        import uuid as _uuid
        from app.auth.utils import hash_password

        target_id = str(_uuid.uuid4())
        await db_session.execute(
            __import__("sqlalchemy").text(
                "INSERT INTO \"user\" (id, email, name, password_hash, role) "
                "VALUES (:id, :email, :name, :pwd, 'user')"
            ),
            {
                "id": target_id,
                "email": f"target2-{_uuid.uuid4().hex[:6]}@example.com",
                "name": "Target User 2",
                "pwd": hash_password("TestPass123"),
            },
        )
        await db_session.flush()

        token = _admin_token(user_id=test_user.id)
        response = await async_client.patch(
            f"/api/admin/users/{target_id}/role",
            headers={"Authorization": f"Bearer {token}"},
            json={"role": "superadmin"},
        )
        assert response.status_code == 422  # Pydantic validation error
