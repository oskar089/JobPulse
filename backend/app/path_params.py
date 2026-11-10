"""Shared path parameter types."""

from typing import Annotated

from fastapi import Path

UUID_PATTERN = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"

UUIDPath = Annotated[str, Path(pattern=UUID_PATTERN)]
