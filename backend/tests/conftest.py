"""Pytest fixtures for unit, integration, and E2E tests.

Provides:
- Integration: async_client, db_session, test_user, auth_headers
- E2E: browser, page, authed_page
"""

from __future__ import annotations

import os
from typing import AsyncIterator
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from playwright.async_api import (
    Browser,
    Page,
    Playwright,
    async_playwright,
)
from playwright.async_api import (
    Error as PlaywrightError,
)
from sqlalchemy import JSON, NullPool, String
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

# ---------------------------------------------------------------------------
# SQLite PostgreSQL compatibility: convert PG-specific types for SQLite
# ---------------------------------------------------------------------------
from sqlalchemy.ext.compiler import compiles  # noqa: E402

from app.auth.utils import create_access_token
from app.database import Base, get_session
from app.main import app
from app.middleware.rate_limit import limiter


@pytest.fixture(autouse=True)
def auth_redis_backend():
    """Provide deterministic Redis security state for every API test."""
    sets: dict[str, set[str]] = {}
    values: dict[str, str] = {}

    class MemoryRedis:
        async def sadd(self, key: str, value: str) -> None:
            sets.setdefault(key, set()).add(value)

        async def sismember(self, key: str, value: str) -> bool:
            return value in sets.get(key, set())

        async def expire(self, _key: str, _ttl: int) -> None:
            return None

        async def delete(self, key: str) -> None:
            sets.pop(key, None)
            values.pop(key, None)

        async def get(self, key: str) -> str | None:
            return values.get(key)

        async def set(self, key: str, value: str, ex: int | None = None) -> None:
            values[key] = str(value)

        async def incr(self, key: str) -> int:
            values[key] = str(int(values.get(key, "0")) + 1)
            return int(values[key])

        async def close(self) -> None:
            return None

        async def aclose(self) -> None:
            return None

    instance = MemoryRedis()
    with patch("app.auth.redis_client.get_redis", return_value=instance):
        yield instance


@compiles(ARRAY, "sqlite")
def compile_array_sqlite(type_, compiler, **kw):
    """Use JSON for ARRAY columns on SQLite."""
    return compiler.process(JSON())


@compiles(UUID, "sqlite")
def compile_uuid_sqlite(type_, compiler, **kw):
    """Use VARCHAR(36) for UUID columns on SQLite."""
    return "VARCHAR(36)"


# Replace ARRAY column types with JSON and UUID columns with String
# in metadata so that bind/result processing works correctly on SQLite.
for _table in Base.metadata.tables.values():
    for _col in _table.columns:
        if isinstance(_col.type, ARRAY):
            _col.type = JSON()
        elif isinstance(_col.type, UUID):
            _col.type = String(36)

# Default URLs — override via env vars or pytest options
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
API_URL = os.getenv("API_URL", "http://localhost:8000/api")
TEST_EMAIL = os.getenv("TEST_EMAIL", "e2e@test.com")
TEST_PASSWORD = os.getenv("TEST_PASSWORD", "Testpass123")

# ---------------------------------------------------------------------------
# Integration test fixtures (SQLite in-memory)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """Create a SQLite engine for testing (file-based, shared across connections)."""
    import tempfile

    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    db_url = f"sqlite+aiosqlite:///{tmp.name}"
    engine = create_async_engine(db_url, echo=False, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield engine
    finally:
        await engine.dispose()
        import os

        os.unlink(tmp.name)


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncIterator[AsyncSession]:
    """Create a fresh SQLAlchemy async session for each test.

    Rolls back after each test to keep the DB clean.
    """

    connection = await test_engine.connect()
    transaction = await connection.begin()

    session = AsyncSession(bind=connection, expire_on_commit=False)

    try:
        yield session
    finally:
        await session.close()
        await transaction.rollback()
        await connection.close()


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession):
    """Create a test user and return it.

    Uses raw SQL to avoid circular imports. Returns an object with .id.
    """
    import uuid

    from app.auth.utils import hash_password

    user_id = str(uuid.uuid4())
    email = f"test-{uuid.uuid4().hex[:8]}@example.com"

    from sqlalchemy import text

    pwd_hash = hash_password("testpass123")
    await db_session.execute(
        text(
            'INSERT INTO "user" (id, email, name, password_hash, role) '
            "VALUES (:id, :email, :name, :password_hash, :role)"
        ),
        {
            "id": user_id,
            "email": email,
            "name": "Test User",
            "password_hash": pwd_hash,
            "role": "user",
        },
    )
    await db_session.commit()

    class FakeUser:
        def __init__(self, uid: str, uemail: str):
            self.id = uid
            self.email = uemail

    return FakeUser(user_id, email)


@pytest_asyncio.fixture
async def auth_headers(test_user) -> dict[str, str]:
    """Return valid Authorization headers for the test user."""
    token = create_access_token(subject=test_user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def async_client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    """Return an httpx AsyncClient wired to the FastAPI test app.

    The get_session dependency is overridden to use the test DB session.
    Resets the rate limiter before each test to prevent cross-test pollution.
    """

    async def override_get_session():
        yield db_session

    app.dependency_overrides[get_session] = override_get_session

    # Reset rate limiter storage so each test starts with fresh counters
    limiter.reset()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# E2E test fixtures (Playwright)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(scope="session")
async def playwright_instance() -> AsyncIterator[Playwright]:
    """Create a Playwright instance (session-scoped)."""
    async with async_playwright() as pw:
        yield pw


@pytest_asyncio.fixture(scope="session")
async def browser(playwright_instance: Playwright) -> AsyncIterator[Browser]:
    """Launch a Chromium browser (session-scoped).

    Set PLAYWRIGHT_HEADLESS=false to see the browser window.
    """
    headless = os.getenv("PLAYWRIGHT_HEADLESS", "true").lower() != "false"
    try:
        browser = await playwright_instance.chromium.launch(headless=headless)
    except PlaywrightError as exc:
        if "Executable doesn't exist" in str(exc):
            pytest.skip("Playwright Chromium is not installed; run `playwright install chromium`")
        raise
    yield browser
    await browser.close()


@pytest_asyncio.fixture
async def page(browser: Browser) -> AsyncIterator[Page]:
    """Create a new browser page for each test."""
    ctx = await browser.new_context(viewport={"width": 1280, "height": 720})
    p = await ctx.new_page()
    yield p
    await ctx.close()


@pytest.fixture
def base_url() -> str:
    """Frontend base URL."""
    return FRONTEND_URL


@pytest.fixture
def api_base_url() -> str:
    """Backend API base URL."""
    return API_URL


async def _authenticate_browser(page: Page, api_base_url: str) -> None:
    """Authenticate through the browser context's cookie-sharing API client."""
    request = page.context.request
    login = await request.post(
        f"{api_base_url}/auth/login",
        data={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    if login.status == 401:
        registration = await request.post(
            f"{api_base_url}/auth/register",
            data={"email": TEST_EMAIL, "password": TEST_PASSWORD, "name": "E2E Test User"},
        )
        assert registration.status == 201, f"E2E registration failed: HTTP {registration.status}"
    else:
        assert login.status == 200, f"E2E login failed: HTTP {login.status}"

    cookies = await page.context.cookies(api_base_url)
    assert any(cookie["name"] == "access_token" for cookie in cookies), (
        "E2E authentication did not set an access_token cookie in the browser context"
    )


@pytest_asyncio.fixture
async def authed_page(page: Page, base_url: str, api_base_url: str) -> Page:
    """Return a profile page authenticated with the browser's httpOnly cookie."""
    await _authenticate_browser(page, api_base_url)
    await page.goto(f"{base_url}/profile")
    await page.wait_for_load_state("networkidle")
    return page
