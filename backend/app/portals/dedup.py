"""Helpers shared by the portal and pipeline routers."""

from collections.abc import Iterable

from app.models import Portal


def dedupe_portals_by_name(portals: Iterable[Portal]) -> list[Portal]:
    """Keep one portal per name; a user-owned portal overrides a built-in one."""
    seen: dict[str, Portal] = {}
    for portal in portals:
        existing = seen.get(portal.name)
        if existing is None or (existing.is_builtin and not portal.is_builtin):
            seen[portal.name] = portal
    return list(seen.values())
