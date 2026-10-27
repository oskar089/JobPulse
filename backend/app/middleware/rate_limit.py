"""Rate limiting middleware using slowapi.

Provides a shared ``Limiter`` instance and an ``init_rate_limiting()``
function to wire it into the FastAPI app.

Storage defaults to in-memory (single process). For multi-worker deployments
set RATE_LIMIT_STORAGE_URI to a Redis URL so counters are shared.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings

# Global rate limits (apply to all endpoints unless overridden)
# Format: "rate/period" e.g., "100/minute", "1000/hour"
GLOBAL_RATE_LIMITS: list[str] = [
    "200/minute",   # General API limit
    "1000/hour",    # Hourly burst protection
]

# Stricter limits for auth endpoints (defined in auth/router.py via @limiter.limit)
# These are in addition to global limits

def _get_client_ip(request: Request) -> str:
    """Use the connection peer; untrusted forwarding headers are spoofable."""
    return get_remote_address(request)


# Created once at import time so route decorators and app.state share the same instance.
limiter = Limiter(
    key_func=_get_client_ip,
    default_limits=GLOBAL_RATE_LIMITS,  # type: ignore[arg-type]
    storage_uri=settings.rate_limit_storage_uri,
)


def init_rate_limiting(app: FastAPI) -> None:
    """Wire slowapi rate limiting into the FastAPI application.

    Must be called after the app is created but before running.
    Registers the limiter in ``app.state`` and adds the 429 handler.
    """
    app.state.limiter = limiter

    # Custom 429 handler with structured response
    async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        # RateLimitExceeded doesn't expose retry_after directly; compute from limit
        retry_after = 60  # default fallback
        return JSONResponse(
            status_code=429,
            content={
                "detail": "Rate limit exceeded",
                "retry_after": retry_after,
                "limit": str(exc.limit) if exc.limit else "unknown",
            },
            headers={"Retry-After": str(retry_after)},
        )

    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)  # type: ignore[arg-type]


def get_limiter() -> Limiter:
    """Get the global limiter instance for use in route decorators."""
    return limiter
