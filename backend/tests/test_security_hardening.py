"""Tests for SSRF protection, session revocation, password limits and pagination caps."""

from __future__ import annotations

import time
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from app.auth.utils import (
    create_access_token,
    create_refresh_token,
    create_reset_token,
    hash_password,
    verify_password,
)
from app.security.url_guard import UnsafeURLError, assert_public_url, validate_url_syntax

PORTAL_PAYLOAD = {
    "name": "Example Portal",
    "base_url": "https://example.com",
    "job_listing_url": "https://example.com/jobs",
    "selectors": {
        "job_card": ".job",
        "title": ".title",
        "company": ".company",
        "description": ".desc",
        "url": "a",
    },
}


class TestUrlGuard:
    @pytest.mark.parametrize(
        "url",
        [
            "http://127.0.0.1/admin",
            "http://localhost:8000",
            "http://10.0.0.5",
            "http://169.254.169.254/latest/meta-data",
            "http://[::1]/",
            "http://[::ffff:127.0.0.1]/",
            "http://192.168.1.10",
            "http://100.64.0.1",
            "ftp://example.com/file",
            "file:///etc/passwd",
        ],
    )
    def test_syntax_check_rejects_non_public_targets(self, url: str) -> None:
        with pytest.raises(UnsafeURLError):
            validate_url_syntax(url)

    def test_syntax_check_accepts_public_hosts(self) -> None:
        assert validate_url_syntax("https://example.com/jobs") == "example.com"
        assert validate_url_syntax("http://93.184.216.34/") == "93.184.216.34"

    async def test_domain_resolving_to_private_ip_is_rejected(self) -> None:
        async def fake_getaddrinfo(*_args, **_kwargs):
            return [(2, 1, 6, "", ("10.0.0.7", 0))]

        with patch("asyncio.get_running_loop") as get_loop:
            get_loop.return_value.getaddrinfo = fake_getaddrinfo
            with pytest.raises(UnsafeURLError):
                await assert_public_url("https://internal.example.com")

    async def test_domain_resolving_to_public_ip_is_accepted(self) -> None:
        async def fake_getaddrinfo(*_args, **_kwargs):
            return [(2, 1, 6, "", ("93.184.216.34", 0))]

        with patch("asyncio.get_running_loop") as get_loop:
            get_loop.return_value.getaddrinfo = fake_getaddrinfo
            await assert_public_url("https://example.com")


class TestPortalUrlValidation:
    async def test_create_portal_rejects_private_url(
        self, async_client: AsyncClient, auth_headers: dict[str, str]
    ) -> None:
        payload = {**PORTAL_PAYLOAD, "job_listing_url": "http://redis:6379/"}
        with patch("app.portals.router.assert_public_url", side_effect=UnsafeURLError("blocked")):
            response = await async_client.post("/api/portals", json=payload, headers=auth_headers)
        assert response.status_code == 422

    async def test_create_portal_rejects_literal_loopback(
        self, async_client: AsyncClient, auth_headers: dict[str, str]
    ) -> None:
        payload = {**PORTAL_PAYLOAD, "base_url": "http://127.0.0.1:5432"}
        response = await async_client.post("/api/portals", json=payload, headers=auth_headers)
        assert response.status_code == 422


class TestSessionRevocation:
    async def test_deleted_user_token_is_rejected(
        self, async_client: AsyncClient, auth_headers: dict[str, str]
    ) -> None:
        ghost = create_access_token(subject="00000000-0000-4000-8000-000000000000")
        response = await async_client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {ghost}"}
        )
        assert response.status_code == 401

    async def test_refresh_token_cannot_be_used_as_access_token(
        self, async_client: AsyncClient, test_user
    ) -> None:
        refresh = create_refresh_token(subject=test_user.id)
        response = await async_client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {refresh}"}
        )
        assert response.status_code == 401

    async def test_password_reset_revokes_existing_tokens(
        self, async_client: AsyncClient, test_user, db_session
    ) -> None:
        from sqlalchemy import text

        row = await db_session.execute(
            text('SELECT password_hash FROM "user" WHERE id = :id'), {"id": test_user.id}
        )
        password_hash = row.scalar_one()

        old_access = create_access_token(subject=test_user.id)
        # Token issued strictly before the revocation mark must die.
        time.sleep(1.1)
        reset = create_reset_token(test_user.email, password_hash)
        response = await async_client.post(
            "/api/auth/reset-password",
            json={"token": reset, "password": "NewSecret123"},
        )
        assert response.status_code == 200

        stale = await async_client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {old_access}"}
        )
        assert stale.status_code == 401

        fresh = create_access_token(subject=test_user.id)
        ok = await async_client.get("/api/auth/me", headers={"Authorization": f"Bearer {fresh}"})
        assert ok.status_code == 200


class TestPasswordLimits:
    def test_long_password_is_rejected_by_hash(self) -> None:
        with pytest.raises(ValueError):
            hash_password("A1" * 40)

    def test_long_password_never_verifies(self) -> None:
        hashed = hash_password("Correct1Horse")
        assert verify_password("A1" * 40, hashed) is False

    async def test_register_rejects_password_over_72_bytes(
        self, async_client: AsyncClient
    ) -> None:
        response = await async_client.post(
            "/api/auth/register",
            json={"email": "long@example.com", "password": "A1" + "x" * 80},
        )
        assert response.status_code == 422

    async def test_login_with_overlong_password_is_401_not_500(
        self, async_client: AsyncClient, test_user
    ) -> None:
        response = await async_client.post(
            "/api/auth/login",
            json={"email": test_user.email, "password": "A1" + "x" * 80},
        )
        assert response.status_code == 401


class TestRateLimitsAndPagination:
    async def test_forgot_password_is_rate_limited(self, async_client: AsyncClient) -> None:
        codes = []
        for _ in range(7):
            response = await async_client.post(
                "/api/auth/forgot-password", json={"email": "nobody@example.com"}
            )
            codes.append(response.status_code)
        assert codes[0] == 200
        assert 429 in codes

    @pytest.mark.parametrize("path", ["/api/applications", "/api/jobs/", "/api/notifications"])
    async def test_page_size_is_capped(
        self, async_client: AsyncClient, auth_headers: dict[str, str], path: str
    ) -> None:
        too_big = await async_client.get(f"{path}?limit=100000", headers=auth_headers)
        assert too_big.status_code == 422
        negative = await async_client.get(f"{path}?offset=-1", headers=auth_headers)
        assert negative.status_code == 422
        ok = await async_client.get(f"{path}?limit=100", headers=auth_headers)
        assert ok.status_code == 200
