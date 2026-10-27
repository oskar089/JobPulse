import re
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.auth.utils import BCRYPT_MAX_BYTES


def validate_password_strength(value: str) -> str:
    """Enforce the password policy shared by registration and reset."""
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(value.encode("utf-8")) > BCRYPT_MAX_BYTES:
        raise ValueError(f"Password must be at most {BCRYPT_MAX_BYTES} bytes")
    if not re.search(r"[A-Z]", value):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"\d", value):
        raise ValueError("Password must contain at least one number")
    return value


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str | None = Field(default=None, max_length=255)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return validate_password_strength(v)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str = Field(max_length=2048)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(default="", max_length=2048)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(max_length=2048)
    password: str

    @field_validator("password")
    @classmethod
    def reset_password_strength(cls, v: str) -> str:
        return validate_password_strength(v)


class UserResponse(BaseModel):
    id: str
    email: str
    name: str | None = None
    role: str = "user"

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Admin schemas
# ---------------------------------------------------------------------------


class AdminUserResponse(BaseModel):
    id: str
    email: str
    name: str | None = None
    role: str
    created_at: str

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    users: list[AdminUserResponse]
    total: int
    page: int
    pages: int


class RoleUpdateRequest(BaseModel):
    role: Literal["user", "admin"]


class PortalTimeSeries(BaseModel):
    date: str
    count: int


class PipelineMetrics(BaseModel):
    total_runs: int
    success_rate: float
    completed: int
    failed: int


class JobsMetrics(BaseModel):
    total_scraped: int
    by_portal: dict[str, list[PortalTimeSeries]]


class ApplicationsMetrics(BaseModel):
    total_submitted: int
    timeseries: list[PortalTimeSeries]


class PortalPerformance(BaseModel):
    portal_name: str
    jobs_found: int
    applications_submitted: int
    success_rate: float


class AnalyticsResponse(BaseModel):
    pipeline: PipelineMetrics
    jobs: JobsMetrics
    applications: ApplicationsMetrics
    portals: list[PortalPerformance]
    conversion_rate: float
    window: str
