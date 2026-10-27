"""Structured logging configuration with structlog.

Provides JSON-formatted logs with correlation IDs for request tracing.
"""

from __future__ import annotations

import logging
import sys
from contextvars import ContextVar
from typing import Any

import structlog
from structlog.stdlib import ProcessorFormatter

# ---------------------------------------------------------------------------
# Context variable for request correlation ID
# ---------------------------------------------------------------------------
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)


def get_request_id() -> str | None:
    """Get the current request ID from context."""
    return request_id_var.get()


def set_request_id(request_id: str) -> None:
    """Set the request ID in context."""
    request_id_var.set(request_id)


# ---------------------------------------------------------------------------
# Shared processors for all loggers
# ---------------------------------------------------------------------------
def add_request_id(logger: Any, method_name: str, event_dict: dict) -> dict:
    """Add request ID to log event if available."""
    request_id = get_request_id()
    if request_id:
        event_dict["request_id"] = request_id
    return event_dict


def add_service_name(logger: Any, method_name: str, event_dict: dict) -> dict:
    """Add service name to log event."""
    event_dict["service"] = "jobpulse-api"
    return event_dict


# Processors applied to ALL log entries (both structlog and stdlib)
shared_processors: list = [
    structlog.contextvars.merge_contextvars,
    add_request_id,
    add_service_name,
    structlog.processors.add_log_level,
    structlog.processors.TimeStamper(fmt="iso", utc=True),
    structlog.processors.StackInfoRenderer(),
    structlog.dev.set_exc_info,
]

# ---------------------------------------------------------------------------
# Configure structlog
# ---------------------------------------------------------------------------
def configure_logging(
    *,
    json_logs: bool = True,
    log_level: str = "INFO",
) -> None:
    """Configure structlog for the application.

    Args:
        json_logs: If True, output JSON logs. If False, output console-friendly logs.
        log_level: Minimum log level (DEBUG, INFO, WARNING, ERROR, CRITICAL).
    """
    # Configure standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper()),
    )

    # Configure structlog
    if json_logs:
        # JSON output for production / log aggregation
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer()
    else:
        # Human-readable output for development
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Configure stdlib logging to use structlog's formatter
    formatter = ProcessorFormatter(
        processor=renderer,
        foreign_pre_chain=shared_processors,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(getattr(logging, log_level.upper()))

    # Reduce noise from verbose libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("celery").setLevel(logging.INFO)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("playwright").setLevel(logging.WARNING)


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Get a structured logger instance.

    Usage:
        logger = get_logger(__name__)
        logger.info("User logged in", user_id=user.id, email=user.email)
    """
    return structlog.get_logger(name)


# ---------------------------------------------------------------------------
# Access logging middleware helper
# ---------------------------------------------------------------------------
class AccessLogger:
    """Log HTTP request/response information."""

    def __init__(self) -> None:
        self.logger = get_logger("access")

    def log_request(
        self,
        method: str,
        path: str,
        status_code: int,
        duration_ms: float,
        request_id: str | None = None,
        client_ip: str | None = None,
        user_agent: str | None = None,
        user_id: str | None = None,
    ) -> None:
        """Log an HTTP request."""
        self.logger.info(
            "HTTP request",
            method=method,
            path=path,
            status_code=status_code,
            duration_ms=round(duration_ms, 2),
            request_id=request_id,
            client_ip=client_ip,
            user_agent=user_agent,
            user_id=user_id,
        )


access_logger = AccessLogger()
