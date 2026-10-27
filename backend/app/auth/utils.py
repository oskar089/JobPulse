import hashlib
import logging
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.config import settings

logger = logging.getLogger(__name__)


BCRYPT_MAX_BYTES = 72


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against a bcrypt hash."""
    plain_bytes = plain_password.encode("utf-8")
    if len(plain_bytes) > BCRYPT_MAX_BYTES:
        return False
    return bcrypt.checkpw(plain_bytes, hashed_password.encode("utf-8"))


def hash_password(password: str) -> str:
    """Hash a password using bcrypt.

    bcrypt only considers the first 72 bytes of its input, so longer
    passwords are rejected instead of being silently truncated (which would
    make two different long passwords equivalent).
    """
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > BCRYPT_MAX_BYTES:
        raise ValueError(f"Password must be at most {BCRYPT_MAX_BYTES} bytes")
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


def create_access_token(subject: str, role: str = "user") -> str:
    """Create a JWT access token for the given user ID."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expires_in_minutes)
    to_encode = {"sub": subject, "exp": expire, "iat": datetime.now(timezone.utc), "role": role}
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(subject: str, role: str = "user") -> str:
    """Create a JWT refresh token (7 day expiry) for the given user ID.

    Includes a unique ``jti`` (JWT ID) claim to guarantee distinct tokens
    even when multiple tokens are issued within the same second.
    """
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expiry_days)
    to_encode = {
        "sub": subject,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "purpose": "refresh",
        "jti": str(uuid.uuid4()),
        "role": role,
    }
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    """Decode and validate a JWT token. Returns payload dict or None on failure."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return payload
    except JWTError:
        return None


def create_reset_token(email: str, password_hash: str) -> str:
    """Create a short-lived JWT for password reset (30 min)."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=30)
    password_version = hashlib.sha256(password_hash.encode("utf-8")).hexdigest()
    to_encode = {
        "sub": email,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "purpose": "reset",
        "password_version": password_version,
    }
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_reset_token(token: str) -> dict | None:
    """Decode a reset token and return its claims when valid."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("purpose") != "reset" or not payload.get("password_version"):
            return None
        return payload
    except JWTError:
        return None
