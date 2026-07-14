"""Admin router with analytics, user management, and role toggle endpoints.

Protected by require_admin dependency — all routes require role='admin' in JWT.
"""

from __future__ import annotations

import asyncio
import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.router import require_admin
from app.auth.schemas import (
    AdminUserResponse,
    AnalyticsResponse,
    ApplicationsMetrics,
    JobsMetrics,
    PipelineMetrics,
    PortalPerformance,
    PortalTimeSeries,
    RoleUpdateRequest,
    UserListResponse,
)
from app.database import get_session
from app.models import Application, PipelineRun, Portal, StoredJob, User

router = APIRouter(prefix="/admin", tags=["admin"])

# ---------------------------------------------------------------------------
# Window parsing
# ---------------------------------------------------------------------------

WINDOW_MAP = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
}


def _parse_window(window: str) -> int:
    """Parse window string (e.g., '30d') into days. Raises ValueError for invalid values."""
    days = WINDOW_MAP.get(window)
    if days is None:
        raise ValueError(f"Invalid window '{window}'. Valid values: 7d, 30d, 90d")
    return days


# ---------------------------------------------------------------------------
# Analytics helper functions (pure, testable)
# ---------------------------------------------------------------------------


def _compute_pipeline_metrics(runs: list) -> PipelineMetrics:
    """Compute pipeline metrics from a list of PipelineRun objects."""
    total = len(runs)
    completed = sum(1 for r in runs if r.status == "completed")
    failed = sum(1 for r in runs if r.status == "failed")
    success_rate = round(100.0 * completed / total, 1) if total > 0 else 0.0
    return PipelineMetrics(
        total_runs=total,
        success_rate=success_rate,
        completed=completed,
        failed=failed,
    )


def _compute_jobs_metrics(jobs: list, portals: dict[str, str]) -> JobsMetrics:
    """Compute jobs-by-portal time-series from StoredJob objects.

    Args:
        jobs: list of StoredJob objects with scraped_at and portal_id
        portals: dict mapping portal_id -> portal_name
    """
    by_portal: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for job in jobs:
        portal_name = portals.get(job.portal_id, "unknown")
        day = job.scraped_at.strftime("%Y-%m-%d") if job.scraped_at else "unknown"
        by_portal[portal_name][day] += 1

    result: dict[str, list[PortalTimeSeries]] = {}
    for portal_name, daily in sorted(by_portal.items()):
        result[portal_name] = [
            PortalTimeSeries(date=d, count=c)
            for d, c in sorted(daily.items())
        ]

    return JobsMetrics(total_scraped=len(jobs), by_portal=result)


def _compute_applications_metrics(apps: list) -> ApplicationsMetrics:
    """Compute applications time-series from Application objects."""
    daily: dict[str, int] = defaultdict(int)
    for app in apps:
        day = app.created_at.strftime("%Y-%m-%d") if app.created_at else "unknown"
        daily[day] += 1

    timeseries = [
        PortalTimeSeries(date=d, count=c)
        for d, c in sorted(daily.items())
    ]
    return ApplicationsMetrics(total_submitted=len(apps), timeseries=timeseries)


def _compute_portal_performance(
    jobs: list, apps: list, portals: dict[str, str]
) -> list[PortalPerformance]:
    """Compute per-portal performance stats."""
    portal_jobs: dict[str, int] = defaultdict(int)
    portal_apps: dict[str, int] = defaultdict(int)

    for job in jobs:
        portal_name = portals.get(job.portal_id, "unknown")
        portal_jobs[portal_name] += 1

    for app in apps:
        job_id = app.stored_job_id
        # Find which portal this job belongs to
        for job in jobs:
            if job.id == job_id:
                portal_name = portals.get(job.portal_id, "unknown")
                portal_apps[portal_name] += 1
                break

    result = []
    all_portals = set(portal_jobs.keys()) | set(portal_apps.keys())
    for portal_name in sorted(all_portals):
        p_jobs = portal_jobs[portal_name]
        p_apps = portal_apps[portal_name]
        success_rate = round(100.0 * p_apps / p_jobs, 1) if p_jobs > 0 else 0.0
        result.append(
            PortalPerformance(
                portal_name=portal_name,
                jobs_found=p_jobs,
                applications_submitted=p_apps,
                success_rate=success_rate,
            )
        )
    return result


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/analytics", response_model=AnalyticsResponse)
async def get_analytics(
    window: str = Query(default="30d"),
    _admin_id: str = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Return aggregated analytics for pipeline runs, jobs, applications, and portals."""
    try:
        days = _parse_window(window)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid window '{window}'. Valid values: 7d, 30d, 90d",
        )

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    # Run 4 queries in parallel
    async def fetch_pipeline_runs():
        result = await session.execute(
            select(PipelineRun).where(PipelineRun.created_at >= cutoff)
        )
        return list(result.scalars().all())

    async def fetch_portals():
        result = await session.execute(select(Portal))
        return {p.id: p.name for p in result.scalars().all()}

    async def fetch_jobs():
        result = await session.execute(
            select(StoredJob).where(StoredJob.scraped_at >= cutoff)
        )
        return list(result.scalars().all())

    async def fetch_apps():
        result = await session.execute(
            select(Application).where(Application.created_at >= cutoff)
        )
        return list(result.scalars().all())

    runs, portals, jobs, apps = await asyncio.gather(
        fetch_pipeline_runs(), fetch_portals(), fetch_jobs(), fetch_apps()
    )

    pipeline = _compute_pipeline_metrics(runs)
    jobs_metrics = _compute_jobs_metrics(jobs, portals)
    applications = _compute_applications_metrics(apps)
    portals_perf = _compute_portal_performance(jobs, apps, portals)

    conversion_rate = (
        round(100.0 * pipeline.completed / len(runs), 1)
        if len(runs) > 0
        else 0.0
    )

    return AnalyticsResponse(
        pipeline=pipeline,
        jobs=jobs_metrics,
        applications=applications,
        portals=portals_perf,
        conversion_rate=conversion_rate,
        window=window,
    )


@router.get("/users", response_model=UserListResponse)
async def list_users(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    _admin_id: str = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Return paginated list of all users."""
    # Count total
    count_result = await session.execute(select(func.count(User.id)))
    total = count_result.scalar_one()

    pages = math.ceil(total / limit) if total > 0 else 1
    offset = (page - 1) * limit

    result = await session.execute(
        select(User).order_by(User.created_at.desc()).offset(offset).limit(limit)
    )
    users = result.scalars().all()

    return UserListResponse(
        users=[
            AdminUserResponse(
                id=u.id,
                email=u.email,
                name=u.name,
                role=u.role,
                created_at=u.created_at.isoformat() if u.created_at else "",
            )
            for u in users
        ],
        total=total,
        page=page,
        pages=pages,
    )


@router.patch("/users/{user_id}/role", response_model=AdminUserResponse)
async def update_user_role(
    user_id: str,
    body: RoleUpdateRequest,
    admin_id: str = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Update a user's role. Prevents self-demotion."""
    if user_id == admin_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own role",
        )

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.role = body.role
    await session.flush()

    return AdminUserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        created_at=user.created_at.isoformat() if user.created_at else "",
    )
