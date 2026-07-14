import logging

from celery import Celery
from celery.signals import worker_shutdown

from app.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "search_jobs",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]
celery_app.conf.task_track_started = True
celery_app.conf.task_ignore_result = False

# Import task modules so Celery registers them
import app.tasks.apply  # noqa: E402, F401
import app.tasks.match  # noqa: E402, F401
import app.tasks.notify  # noqa: E402, F401
import app.tasks.orchestrator  # noqa: E402, F401
import app.tasks.scheduler  # noqa: E402, F401
import app.tasks.scrape  # noqa: E402, F401


@worker_shutdown.connect
def close_redis_on_shutdown(**kwargs) -> None:
    """Close the Celery broker/backend Redis connections on worker shutdown.

    Prevents connection leaks when the worker pool recycles or shuts down.
    """
    try:
        conn = celery_app.connection()
        if conn:
            conn.close()
            logger.debug("Celery broker connection closed on worker shutdown")
    except Exception as exc:
        logger.warning("Failed to close Celery broker connection: %s", exc)
