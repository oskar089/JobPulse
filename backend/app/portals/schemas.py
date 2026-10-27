from datetime import datetime
from typing import TypeVar

from pydantic import BaseModel, HttpUrl, field_validator

from app.security.url_guard import UnsafeURLError, validate_url_syntax

UrlT = TypeVar("UrlT", HttpUrl, HttpUrl | None)


def _reject_non_public_url(value: UrlT) -> UrlT:
    """Reject URLs that point at private, loopback or otherwise reserved hosts."""
    if value is None:
        return value
    try:
        validate_url_syntax(str(value))
    except UnsafeURLError as exc:
        raise ValueError(str(exc)) from exc
    return value


class PortalSelectors(BaseModel):
    """CSS/XPath selectors for each scraping field on a job portal."""

    job_card: str
    title: str
    company: str
    location: str | None = None
    description: str
    url: str
    salary: str | None = None
    posted_date: str | None = None
    apply_button: str | None = None


class PortalCreate(BaseModel):
    name: str
    base_url: HttpUrl
    job_listing_url: HttpUrl
    selectors: PortalSelectors
    scrape_interval_min: int = 60

    @field_validator("base_url", "job_listing_url")
    @classmethod
    def _validate_public_url(cls, value: HttpUrl) -> HttpUrl:
        return _reject_non_public_url(value)


class PortalUpdate(BaseModel):
    name: str | None = None
    base_url: HttpUrl | None = None
    job_listing_url: HttpUrl | None = None
    selectors: PortalSelectors | None = None
    is_enabled: bool | None = None
    scrape_interval_min: int | None = None

    @field_validator("base_url", "job_listing_url")
    @classmethod
    def _validate_public_url(cls, value: HttpUrl | None) -> HttpUrl | None:
        return _reject_non_public_url(value)


class PortalResponse(BaseModel):
    id: str
    name: str
    base_url: str
    job_listing_url: str
    selectors: dict
    is_builtin: bool
    is_enabled: bool
    is_verified: bool
    scrape_interval_min: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
