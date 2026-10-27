from sqlalchemy import JSON, String
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# SQLite dev compatibility: register PG-specific type compilers so the local
# SQLite database can render and query columns defined with ARRAY/UUID.
# Mirrors tests/conftest.py; active only for sqlite URLs, no effect on Postgres.


@compiles(ARRAY, "sqlite")
def _compile_array_sqlite(type_, compiler, **kw):
    """Use JSON for ARRAY columns on SQLite."""
    return compiler.process(JSON())


@compiles(UUID, "sqlite")
def _compile_uuid_sqlite(type_, compiler, **kw):
    """Use VARCHAR(36) for UUID columns on SQLite."""
    return "VARCHAR(36)"


def _apply_sqlite_metadata_compat() -> None:
    """Replace PG column types with SQLite-friendly equivalents in metadata.

    Without this, bind/result processing for ARRAY/UUID fails at runtime on
    the local SQLite database (same workaround as tests/conftest.py).
    """
    for _table in Base.metadata.tables.values():
        for _col in _table.columns:
            if isinstance(_col.type, ARRAY):
                _col.type = JSON()
            elif isinstance(_col.type, UUID):
                _col.type = String(36)


def _is_sqlite(url: str) -> bool:
    return url.startswith("sqlite")


# Lazy engine — created on first use, not at import time.
# This avoids import-time database connections that break tests.
_engine = None
_async_session_factory_instance = None


def _get_engine():
    global _engine
    if _engine is None:
        if _is_sqlite(settings.database_url):
            _apply_sqlite_metadata_compat()
        _engine = create_async_engine(settings.database_url, echo=settings.debug)
    return _engine


def _get_session_factory():
    global _async_session_factory_instance
    if _async_session_factory_instance is None:
        _async_session_factory_instance = async_sessionmaker(
            _get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _async_session_factory_instance


# Public accessors — lazy, safe for import time
def get_engine():
    return _get_engine()


def get_async_session_factory():
    return _get_session_factory()


# Backward-compatible lazy proxies for existing imports
class _LazyEngine:
    """Proxy that creates the engine on first use."""

    def __getattr__(self, name):
        return getattr(_get_engine(), name)

    def __enter__(self):
        return _get_engine().__enter__()

    def __exit__(self, *args):
        return _get_engine().__exit__(*args)


class _LazySessionFactory:
    """Proxy that creates the session factory on first use."""

    def __call__(self, *args, **kwargs):
        return _get_session_factory()(*args, **kwargs)


engine = _LazyEngine()
async_session_factory = _LazySessionFactory()


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncSession:  # type: ignore[misc]
    async with _get_session_factory()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
