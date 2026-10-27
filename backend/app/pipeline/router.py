"""Pipeline run endpoints."""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.router import get_current_user_id
from app.database import get_session
from app.middleware.rate_limit import limiter
from app.models import PipelineRun, Portal
from app.portals.dedup import dedupe_portals_by_name
from app.tasks.orchestrator import run_pipeline as run_pipeline_task

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = {"pending", "scraping", "matching", "applying", "notifying"}
CANCELLABLE_STATUSES = {"pending", "scraping", "matching", "applying", "notifying"}

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


@router.get("/latest")
async def latest_pipeline_runs(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Return the user's 10 most recent pipeline runs with portal name and status."""
    result = await session.execute(
        select(PipelineRun, Portal.name)
        .join(Portal, PipelineRun.portal_id == Portal.id, isouter=True)
        .where(PipelineRun.user_id == user_id)
        .order_by(PipelineRun.created_at.desc())
        .limit(10)
    )
    rows = result.all()

    runs_list = []
    for run, portal_name in rows:
        runs_list.append(
            {
                "pipeline_run_id": run.id,
                "portal_name": portal_name or "Unknown",
                "status": run.status,
                "trigger": run.trigger,
                "created_at": run.created_at.isoformat(),
                "completed_at": run.completed_at.isoformat() if run.completed_at else None,
                "error_step": run.error_step,
                "error_msg": run.error_msg,
            }
        )

    return {
        "runs": runs_list,
        "has_active_runs": any(r.status in ACTIVE_STATUSES for r, _ in rows),
    }


@router.post("/run")
@limiter.limit("5/minute")
async def trigger_pipeline(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Trigger a pipeline run for all enabled portals of the current user."""
    # Get all enabled portals for this user (including built-in), deduplicated by name.
    # User-owned portals override built-in ones to prevent duplicate runs.
    result = await session.execute(
        select(Portal).where(
            Portal.is_enabled,
            (Portal.user_id == user_id) | (Portal.user_id.is_(None)),
        )
    )
    portals = dedupe_portals_by_name(result.scalars().all())

    if not portals:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No portals are enabled. Enable at least one first.",
        )

    runs = []
    for portal in portals:
        pipeline_run = PipelineRun(
            id=str(uuid4()),
            user_id=user_id,
            portal_id=portal.id,
            status="pending",
            trigger="manual",
        )
        session.add(pipeline_run)
        runs.append(
            {
                "pipeline_run_id": pipeline_run.id,
                "portal_id": portal.id,
                "portal_name": portal.name,
                "status": "pending",
            }
        )

    await session.commit()

    # Dispatch Celery tasks
    queued = 0
    dispatch_errors: dict[str, str] = {}
    for run in runs:
        try:
            run_pipeline_task.delay(run["pipeline_run_id"])
            run["status"] = "queued"
            queued += 1
        except Exception as exc:
            logger.warning("Failed to dispatch Celery task for %s: %s", run["pipeline_run_id"], exc)
            run["status"] = "dispatch_failed"
            dispatch_errors[run["pipeline_run_id"]] = str(exc)

    # Mark undispatched runs as failed to avoid orphaned "pending" runs
    for run_id, error in dispatch_errors.items():
        pipeline = await session.get(PipelineRun, run_id)
        if pipeline:
            pipeline.status = "failed"
            pipeline.error_msg = f"Dispatch failed: {error}"
    if dispatch_errors:
        await session.commit()
    failed = len(dispatch_errors)

    if queued == 0 and failed > 0:
        # All dispatches failed — Redis/Celery issue
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Could not queue the tasks. "
                "Make sure Redis is running and the Celery workers are active."
            ),
        )

    message = f"Search started for {queued} portal(s)"
    if failed:
        message += f" ({failed} failed)"

    return {
        "message": message,
        "runs": runs,
    }


@router.post("/{run_id}/cancel")
async def cancel_pipeline_run(
    run_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Cancel a pipeline run that hasn't completed yet."""
    try:
        result = await session.execute(
            select(PipelineRun).where(
                PipelineRun.id == run_id,
                PipelineRun.user_id == user_id,
            )
        )
        pipeline = result.scalar_one_or_none()
        if pipeline is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pipeline run not found",
            )

        if pipeline.status not in CANCELLABLE_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot cancel a pipeline with status '{pipeline.status}'",
            )

        pipeline.status = "cancelled"
        pipeline.completed_at = datetime.now(timezone.utc)
        await session.commit()

        logger.info("Pipeline %s cancelled by user", run_id)
        return {"status": "cancelled", "pipeline_run_id": run_id}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to cancel pipeline %s: %s", run_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel the pipeline",
        )
