"""Tests for the scrape -> match -> apply -> notify worker pipeline."""

from __future__ import annotations

import uuid
from contextlib import ExitStack
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.matching.engine import MatcherEngine
from app.models import Application, Notification, PipelineRun, Portal, Profile, StoredJob, User
from app.scrapers.engine import ScrapedJob, resolve_job_identity

TASK_MODULES = ("scrape", "match", "apply", "notify", "orchestrator")
SELECTORS = {
    "job_card": ".card",
    "title": "h2",
    "company": ".company",
    "description": ".description",
    "url": "a",
}


@pytest_asyncio.fixture
async def session_factory(test_engine):
    """Point every task module at the test database."""
    factory = async_sessionmaker(test_engine, expire_on_commit=False)
    with ExitStack() as stack:
        for module in TASK_MODULES:
            stack.enter_context(patch(f"app.tasks.{module}.async_session_factory", factory))
        yield factory


@pytest_asyncio.fixture
async def pipeline(session_factory) -> PipelineRun:
    """Persist a user with a matching profile, a portal and a pending run."""
    async with session_factory() as session:
        user = User(email=f"{uuid.uuid4().hex}@example.com", password_hash="x", name="Ada")
        session.add(user)
        await session.flush()
        portal = Portal(
            user_id=user.id,
            name=f"portal-{uuid.uuid4().hex}",
            base_url="https://example.com",
            job_listing_url="https://example.com/jobs",
            selectors=SELECTORS,
        )
        session.add_all(
            [
                portal,
                Profile(
                    user_id=user.id,
                    target_roles=["Backend Developer"],
                    tech_stack=["Python"],
                    experience_level="senior",
                    remote_only=True,
                ),
            ]
        )
        await session.flush()
        run = PipelineRun(user_id=user.id, portal_id=portal.id, status="pending")
        session.add(run)
        await session.commit()
        return run


def _scraped_job(url: str = "https://example.com/jobs/1") -> ScrapedJob:
    return resolve_job_identity(
        ScrapedJob(
            title="Senior Backend Developer",
            company="Acme",
            location="Remote",
            description="Senior role using Python",
            url=url,
        ),
        "https://example.com/jobs",
    )


def _fake_scraper(jobs: list[ScrapedJob]):
    engine = AsyncMock()
    engine.scrape.return_value = jobs
    scraper_cls = patch("app.tasks.scrape.ScraperEngine").start()
    scraper_cls.return_value.__aenter__.return_value = engine
    return scraper_cls


async def _count(session_factory, model, *criteria) -> int:
    async with session_factory() as session:
        result = await session.execute(select(func.count()).select_from(model).where(*criteria))
        return result.scalar_one()


async def _status(session_factory, run_id: str) -> str:
    async with session_factory() as session:
        run = await session.get(PipelineRun, run_id)
        return run.status


class TestJobIdentity:
    def test_relative_url_is_resolved_against_listing_url(self) -> None:
        job = resolve_job_identity(ScrapedJob(url="/jobs/42"), "https://example.com/search?q=dev")
        assert job.url == "https://example.com/jobs/42"
        assert job.external_id

    def test_tracking_parameters_do_not_change_identity(self) -> None:
        base = "https://example.com/jobs"
        first = resolve_job_identity(ScrapedJob(url="/jobs/view/42?trackingId=a&id=7#top"), base)
        second = resolve_job_identity(ScrapedJob(url="/jobs/view/42?id=7&trackingId=b"), base)
        other = resolve_job_identity(ScrapedJob(url="/jobs/view/42?id=8"), base)
        assert first.external_id == second.external_id
        assert first.external_id != other.external_id

    def test_job_without_url_has_no_identity(self) -> None:
        job = resolve_job_identity(ScrapedJob(url=""), "https://example.com/jobs")
        assert job.url == ""
        assert job.external_id is None


class TestScrapeTask:
    async def test_rescraping_same_jobs_stores_them_once(self, session_factory, pipeline) -> None:
        from app.tasks.scrape import _scrape_portal

        _fake_scraper([_scraped_job()])
        try:
            first = await _scrape_portal(pipeline.portal_id, pipeline.user_id, pipeline.id)
            second = await _scrape_portal(pipeline.portal_id, pipeline.user_id, pipeline.id)
        finally:
            patch.stopall()

        assert first["jobs_stored"] == 1
        assert second["jobs_stored"] == 0
        stored = await _count(session_factory, StoredJob, StoredJob.portal_id == pipeline.portal_id)
        assert stored == 1
        assert await _status(session_factory, pipeline.id) == "scraping"


class TestMatchTask:
    async def test_rematching_does_not_duplicate_applications(
        self, session_factory, pipeline
    ) -> None:
        from app.tasks.match import _match_applications

        async with session_factory() as session:
            session.add(
                StoredJob(
                    portal_id=pipeline.portal_id,
                    external_id="job-1",
                    title="Backend Developer",
                    company="Acme",
                    description="Senior role using Python",
                    url="https://example.com/jobs/1",
                )
            )
            await session.commit()

        with patch("app.tasks.match.settings.match_threshold", 50):
            first = await _match_applications(pipeline.user_id, pipeline.id)
            second = await _match_applications(pipeline.user_id, pipeline.id)

        assert first["applications_created"] == 1
        assert second["applications_created"] == 0
        created = await _count(
            session_factory, Application, Application.user_id == pipeline.user_id
        )
        assert created == 1
        assert await _status(session_factory, pipeline.id) == "matching"


class TestMatcherEngine:
    def test_exact_role_wins_over_earlier_partial_match(self) -> None:
        engine = MatcherEngine()
        score = engine._score_role_match(
            ["Frontend Developer", "Backend Developer"], "Backend Developer"
        )
        assert score == 1.0

    def test_seniority_keywords_match_whole_words_only(self) -> None:
        engine = MatcherEngine()
        assert engine._score_experience("lead", "Build middleware for leading brands") == 0.5
        assert engine._score_experience("senior", "We need a senior engineer") == 1.0


class TestOrchestrator:
    async def test_unexpected_step_error_marks_run_failed(self, session_factory, pipeline) -> None:
        from app.tasks.orchestrator import _run_pipeline

        with patch("app.tasks.scrape._scrape_portal", side_effect=RuntimeError("boom")):
            result = await _run_pipeline(pipeline.id)

        assert result["status"] == "failed"
        async with session_factory() as session:
            run = await session.get(PipelineRun, pipeline.id)
            assert run.status == "failed"
            assert run.error_step == "scrape"
            assert run.completed_at is not None

    async def test_apply_step_does_not_resurrect_cancelled_run(
        self, session_factory, pipeline
    ) -> None:
        from app.tasks.apply import _apply_to_job

        async with session_factory() as session:
            job = StoredJob(
                portal_id=pipeline.portal_id,
                external_id="job-cancel",
                title="Backend Developer",
                company="Acme",
                description="Python",
                url="https://example.com/jobs/2",
            )
            session.add(job)
            await session.flush()
            application = Application(
                user_id=pipeline.user_id, stored_job_id=job.id, pipeline_run_id=pipeline.id
            )
            session.add(application)
            run = await session.get(PipelineRun, pipeline.id)
            run.status = "cancelled"
            await session.commit()

        applicator = AsyncMock()
        applicator.apply.return_value = {"status": "submitted"}
        with (
            patch("app.applicator.engine.AutoApplicator") as applicator_cls,
            patch(
                "app.cover_letter.generator.CoverLetterGenerator.generate",
                new=AsyncMock(return_value="letter"),
            ),
        ):
            applicator_cls.return_value.__aenter__.return_value = applicator
            await _apply_to_job(application.id, pipeline.user_id, pipeline.id)

        assert await _status(session_factory, pipeline.id) == "cancelled"


class TestNotifyTask:
    async def _submitted_application(self, session_factory, pipeline) -> str:
        async with session_factory() as session:
            job = StoredJob(
                portal_id=pipeline.portal_id,
                external_id=f"job-{uuid.uuid4().hex}",
                title="Backend Developer",
                company="Acme",
                description="Python",
                url="https://example.com/jobs/3",
            )
            session.add(job)
            await session.flush()
            application = Application(
                user_id=pipeline.user_id,
                stored_job_id=job.id,
                pipeline_run_id=pipeline.id,
                status="submitted",
            )
            session.add(application)
            await session.commit()
            return application.id

    async def _set_preferences(self, session_factory, user_id: str, preferences: dict) -> None:
        async with session_factory() as session:
            result = await session.execute(select(Profile).where(Profile.user_id == user_id))
            result.scalar_one().notification_preferences = preferences
            await session.commit()

    async def test_email_is_not_sent_unless_enabled(self, session_factory, pipeline) -> None:
        from app.tasks.notify import _notify_result

        application_id = await self._submitted_application(session_factory, pipeline)
        with patch(
            "app.notifications.service.NotificationService.send_email", new=AsyncMock()
        ) as send_email:
            result = await _notify_result(application_id, pipeline.id)

        assert result["status"] == "completed"
        send_email.assert_not_awaited()
        in_app = await _count(
            session_factory, Notification, Notification.application_id == application_id
        )
        assert in_app == 1

    async def test_email_is_sent_when_enabled(self, session_factory, pipeline) -> None:
        from app.tasks.notify import _notify_result

        await self._set_preferences(session_factory, pipeline.user_id, {"email": True})
        application_id = await self._submitted_application(session_factory, pipeline)
        with patch(
            "app.notifications.service.NotificationService.send_email", new=AsyncMock()
        ) as send_email:
            await _notify_result(application_id, pipeline.id)

        send_email.assert_awaited_once()

    async def test_disabled_event_is_skipped(self, session_factory, pipeline) -> None:
        from app.tasks.notify import _notify_result

        await self._set_preferences(session_factory, pipeline.user_id, {"on_submit": False})
        application_id = await self._submitted_application(session_factory, pipeline)
        result = await _notify_result(application_id, pipeline.id)

        assert result["status"] == "skipped"
        in_app = await _count(
            session_factory, Notification, Notification.application_id == application_id
        )
        assert in_app == 0


class TestBeatSchedule:
    def test_standalone_beat_loads_the_periodic_schedule(self) -> None:
        from app.celery_app import celery_app

        tasks = {entry["task"] for entry in celery_app.conf.beat_schedule.values()}
        assert "app.tasks.scheduler.scheduled_pipeline_check" in tasks


class TestApiContracts:
    async def test_create_portal_persists_urls(
        self, async_client: AsyncClient, auth_headers: dict[str, str]
    ) -> None:
        payload = {
            "name": "Custom",
            "base_url": "https://example.com",
            "job_listing_url": "https://example.com/jobs",
            "selectors": SELECTORS,
        }
        with patch("app.portals.router.assert_public_url", new=AsyncMock()):
            response = await async_client.post("/api/portals", json=payload, headers=auth_headers)

        assert response.status_code == 201
        assert response.json()["job_listing_url"] == "https://example.com/jobs"

    @pytest.mark.parametrize("path", ["/api/jobs", "/api/jobs/"])
    async def test_jobs_route_answers_without_redirect(
        self, async_client: AsyncClient, auth_headers: dict[str, str], path: str
    ) -> None:
        response = await async_client.get(path, headers=auth_headers)
        assert response.status_code == 200
