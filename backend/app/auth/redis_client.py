"""Redis-backed authentication security state."""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable
from typing import TypeVar

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.config import settings

logger = logging.getLogger(__name__)
T = TypeVar("T")


class AuthStoreUnavailableError(RuntimeError):
    """Security state could not be read from or written to Redis."""


async def get_redis() -> Redis:
    """Return an async Redis connection."""
    return Redis.from_url(settings.redis_url, decode_responses=True)


async def _run_security_operation(operation: Awaitable[T], description: str) -> T:
    """Execute a Redis security operation and fail closed on outages."""
    try:
        return await operation
    except RedisError as exc:
        logger.error("Redis authentication operation failed: %s", description)
        raise AuthStoreUnavailableError("Authentication store unavailable") from exc


async def blacklist_refresh_token(
    user_id: str,
    refresh_token: str,
    ttl_seconds: int = 604800,
) -> None:
    """Revoke a refresh token until its natural expiration."""
    redis = await get_redis()
    try:
        key = f"refresh_blacklist:{user_id}"
        await _run_security_operation(redis.sadd(key, refresh_token), "revoke refresh token")
        await _run_security_operation(redis.expire(key, ttl_seconds), "expire revocation set")
    finally:
        await redis.aclose()


async def is_token_blacklisted(user_id: str, refresh_token: str) -> bool:
    """Return whether a refresh token is revoked, failing closed on errors."""
    redis = await get_redis()
    try:
        key = f"refresh_blacklist:{user_id}"
        result = await _run_security_operation(
            redis.sismember(key, refresh_token),
            "check refresh token revocation",
        )
        return bool(result)
    finally:
        await redis.aclose()


LOCKOUT_THRESHOLD = 5
LOCKOUT_TTL = 900


async def record_failed_login(user_id: str) -> int:
    """Increment and return the failed-login counter."""
    redis = await get_redis()
    try:
        key = f"lockout:{user_id}"
        count = await _run_security_operation(redis.incr(key), "record failed login")
        if count == 1:
            await _run_security_operation(redis.expire(key, LOCKOUT_TTL), "expire lockout")
        return int(count)
    finally:
        await redis.aclose()


async def is_account_locked(user_id: str) -> bool:
    """Return whether the failed-login threshold has been reached."""
    redis = await get_redis()
    try:
        value = await _run_security_operation(redis.get(f"lockout:{user_id}"), "check lockout")
        return value is not None and int(value) >= LOCKOUT_THRESHOLD
    finally:
        await redis.aclose()


async def clear_lockout(user_id: str) -> None:
    """Clear the failed-login counter after successful authentication."""
    redis = await get_redis()
    try:
        await _run_security_operation(redis.delete(f"lockout:{user_id}"), "clear lockout")
    finally:
        await redis.aclose()


SESSION_REVOCATION_TTL = 604800 + 900  # refresh-token lifetime plus one access-token lifetime


async def revoke_user_sessions(user_id: str) -> None:
    """Invalidate every token issued to the user before this moment."""
    redis = await get_redis()
    try:
        await _run_security_operation(
            redis.set(
                f"sessions_revoked_at:{user_id}",
                str(int(time.time())),
                ex=SESSION_REVOCATION_TTL,
            ),
            "revoke user sessions",
        )
    finally:
        await redis.aclose()


async def is_token_revoked_for_user(user_id: str, issued_at: int | None) -> bool:
    """Return whether a token issued at ``issued_at`` predates the user's revocation mark."""
    redis = await get_redis()
    try:
        value = await _run_security_operation(
            redis.get(f"sessions_revoked_at:{user_id}"),
            "check session revocation",
        )
    finally:
        await redis.aclose()
    if value is None:
        return False
    return issued_at is None or int(issued_at) < int(value)
