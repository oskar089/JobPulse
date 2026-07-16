from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# Lazy engine — created on first use, not at import time.
# This avoids import-time database connections that break tests.
_engine = None
_async_session_factory_instance = None


def _get_engine():
    global _engine
    if _engine is None:
        _engine = create_async_engine(settings.database_url, echo=settings.debug)
    return _engine


def _get_session_factory():
    global _async_session_factory_instance
    if _async_session_factory_instance is None:
        _async_session_factory_instance = async_sessionmaker(
            _get_engine(), class_=AsyncSession, expire_on_commit=False,
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
