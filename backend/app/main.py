"""FastAPI application entry point for Search Jobs backend."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import make_asgi_app
from sqlalchemy import text

from app.applications.router import router as applications_router
from app.auth.redis_client import AuthStoreUnavailableError
from app.auth.router import router as auth_router
from app.celery_app import celery_app
from app.config import settings
from app.database import engine
from app.jobs.router import router as jobs_router
from app.logging_config import configure_logging, get_logger
from app.middleware.rate_limit import init_rate_limiting
from app.middleware.request_id import RequestIDMiddleware, SecurityHeadersMiddleware
from app.notifications.router import router as notifications_router
from app.pipeline.router import router as pipeline_router
from app.portals.router import router as portals_router
from app.profiles.router import router as profiles_router
from app.routers.admin import router as admin_router

# Configure structured logging immediately on import
configure_logging(json_logs=not settings.debug, log_level="DEBUG" if settings.debug else "INFO")

logger = get_logger(__name__)


def log_non_critical_warnings() -> None:
    """Log warnings for missing non-critical configuration values."""
    if not settings.llm_api_key:
        logger.warning("LLM_API_KEY is not set — LLM features will be unavailable")
    if not settings.smtp_host:
        logger.warning("SMTP_HOST is not set — email notifications will be unavailable")


def run_startup_validation() -> None:
    """Validate critical configuration at startup and log warnings for non-critical configs."""
    settings.validate_startup()
    log_non_critical_warnings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — validates config on startup and initializes middleware."""
    logger.info("Application starting up", app_name=settings.app_name, env=settings.app_env)
    run_startup_validation()
    init_rate_limiting(app)
    yield
    logger.info("Application shutting down")


app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    lifespan=lifespan,
    openapi_url=f"{settings.api_prefix}/openapi.json",
    docs_url=f"{settings.api_prefix}/docs",
    redoc_url=f"{settings.api_prefix}/redoc",
)


@app.exception_handler(AuthStoreUnavailableError)
async def auth_store_unavailable_handler(_request, _exc: AuthStoreUnavailableError):
    """Return a controlled error rather than bypassing security controls."""
    return JSONResponse(
        status_code=503,
        content={"detail": "Authentication service temporarily unavailable"},
    )


# Middleware order matters: outermost first (applied last to response)
# 1. Security headers (outermost - applies to all responses)
app.add_middleware(
    SecurityHeadersMiddleware,
    enable_hsts=settings.app_env == "production",
)

# 2. Request ID correlation (inner to security, outer to CORS)
app.add_middleware(RequestIDMiddleware)

# 3. CORS
origins = [origin.strip() for origin in settings.cors_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "Cookie"],
)

# Routers
app.include_router(applications_router, prefix=settings.api_prefix)
app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(portals_router, prefix=settings.api_prefix)
app.include_router(profiles_router, prefix=settings.api_prefix)
app.include_router(pipeline_router, prefix=settings.api_prefix)
app.include_router(jobs_router, prefix=settings.api_prefix)
app.include_router(notifications_router, prefix=settings.api_prefix)
app.include_router(admin_router, prefix=settings.api_prefix)

# Prometheus metrics endpoint (unauthenticated, internal network only)
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)


@app.get("/health")
async def health_check():
    """Probe DB, Redis, and Celery workers. Returns 200 if all healthy, 503 otherwise.

    Individual component failures are logged and reported in the response
    body — the endpoint does not crash on degraded services.
    """
    from app.auth.redis_client import get_redis

    statuses: dict[str, str] = {}

    # DB check — run SELECT 1
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        statuses["db"] = "healthy"
    except Exception as exc:
        logger.warning("Health check: DB unhealthy", error=str(exc))
        statuses["db"] = "unhealthy"

    # Redis check — send PING
    try:
        r = await get_redis()
        await r.ping()
        await r.close()
        statuses["redis"] = "healthy"
    except Exception as exc:
        logger.warning("Health check: Redis unhealthy", error=str(exc))
        statuses["redis"] = "unhealthy"

    # Celery check — ping workers with 3-second timeout
    try:
        result = celery_app.control.ping(timeout=3)
        statuses["celery"] = "healthy" if result else "unhealthy"
    except Exception as exc:
        logger.warning("Health check: Celery unhealthy", error=str(exc))
        statuses["celery"] = "unhealthy"

    all_healthy = all(v == "healthy" for v in statuses.values())
    if all_healthy:
        logger.info("Health check passed", **statuses)
        return {"status": "ok", **statuses}

    logger.warning("Health check degraded", **statuses)
    return JSONResponse(
        status_code=503,
        content={"status": "degraded", **statuses},
    )
