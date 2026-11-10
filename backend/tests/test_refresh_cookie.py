"""Tests for the httpOnly refresh-token cookie used by browser clients."""

from __future__ import annotations

from httpx import AsyncClient, Response

from app.auth.utils import create_access_token, create_refresh_token

REFRESH_COOKIE = "refresh_token"


def _set_cookie_header(response: Response, name: str) -> str:
    for header in response.headers.get_list("set-cookie"):
        if header.startswith(f"{name}="):
            return header
    raise AssertionError(f"{name} cookie was not set")


def _cookie_value(response: Response, name: str) -> str:
    return _set_cookie_header(response, name).split(";")[0].split("=", 1)[1].strip('"')


class TestRefreshCookieIssued:
    async def test_login_sets_httponly_refresh_cookie(
        self, async_client: AsyncClient, test_user
    ) -> None:
        response = await async_client.post(
            "/api/auth/login", json={"email": test_user.email, "password": "testpass123"}
        )

        assert response.status_code == 200
        header = _set_cookie_header(response, REFRESH_COOKIE).lower()
        assert "httponly" in header
        assert "path=/api/auth" in header
        assert "samesite=lax" in header
        assert _cookie_value(response, REFRESH_COOKIE) == response.json()["refresh_token"]

    async def test_register_sets_refresh_cookie(self, async_client: AsyncClient) -> None:
        response = await async_client.post(
            "/api/auth/register",
            json={"email": "cookie-user@example.com", "password": "Testpass123", "name": "Cookie"},
        )

        assert response.status_code == 201
        assert _cookie_value(response, REFRESH_COOKIE) == response.json()["refresh_token"]


class TestRefreshFromCookie:
    async def test_refresh_without_body_uses_cookie_and_rotates_it(
        self, async_client: AsyncClient, test_user, auth_redis_backend
    ) -> None:
        refresh = create_refresh_token(subject=test_user.id)

        response = await async_client.post(
            "/api/auth/refresh", headers={"Cookie": f"{REFRESH_COOKIE}={refresh}"}
        )

        assert response.status_code == 200
        rotated = _cookie_value(response, REFRESH_COOKIE)
        assert rotated == response.json()["refresh_token"]
        assert rotated != refresh
        assert _cookie_value(response, "access_token") == response.json()["access_token"]
        assert await auth_redis_backend.sismember(f"refresh_blacklist:{test_user.id}", refresh)

    async def test_refresh_without_any_token_returns_401(self, async_client: AsyncClient) -> None:
        response = await async_client.post("/api/auth/refresh")
        assert response.status_code == 401

    async def test_body_token_takes_precedence_over_cookie(
        self, async_client: AsyncClient, test_user
    ) -> None:
        refresh = create_refresh_token(subject=test_user.id)

        response = await async_client.post(
            "/api/auth/refresh",
            json={"refresh_token": refresh},
            headers={"Cookie": f"{REFRESH_COOKIE}=stale-cookie"},
        )

        assert response.status_code == 200


class TestLogoutClearsRefreshCookie:
    async def test_logout_revokes_cookie_token_and_clears_both_cookies(
        self, async_client: AsyncClient, test_user, auth_redis_backend
    ) -> None:
        access = create_access_token(subject=test_user.id)
        refresh = create_refresh_token(subject=test_user.id)

        response = await async_client.post(
            "/api/auth/logout",
            json={},
            headers={"Cookie": f"access_token={access}; {REFRESH_COOKIE}={refresh}"},
        )

        assert response.status_code == 200
        assert await auth_redis_backend.sismember(f"refresh_blacklist:{test_user.id}", refresh)
        assert "max-age=0" in _set_cookie_header(response, REFRESH_COOKIE).lower()
        assert "max-age=0" in _set_cookie_header(response, "access_token").lower()
