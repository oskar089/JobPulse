import re

from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one number")
        return v


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
    token: str
    password: str

    @field_validator("password")
    @classmethod
    def reset_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one number")
        return v


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
