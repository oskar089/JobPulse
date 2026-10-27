"""SSRF protection for user-supplied URLs.

Every URL that the backend (or a headless browser it controls) fetches on
behalf of a user must pass through this module. A URL is accepted only when
its scheme is http/https and every address its hostname resolves to is a
public, globally routable IP address.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urlparse

ALLOWED_SCHEMES = frozenset({"http", "https"})
BLOCKED_HOSTNAMES = frozenset({"localhost", "localhost.localdomain"})


class UnsafeURLError(ValueError):
    """Raised when a URL targets a non-public destination."""


def _is_public_ip(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Return True only for globally routable unicast addresses."""
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        address = address.ipv4_mapped
    return address.is_global and not address.is_multicast


def validate_url_syntax(url: str) -> str:
    """Validate scheme, hostname and literal IPs without touching the network.

    Returns the hostname so callers can resolve it. Raises ``UnsafeURLError``.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise UnsafeURLError("Invalid URL scheme. Only http and https are allowed.")
    hostname = parsed.hostname
    if not hostname:
        raise UnsafeURLError("URL must include a hostname.")
    if hostname.lower().rstrip(".") in BLOCKED_HOSTNAMES:
        raise UnsafeURLError("URL points to a private or reserved address.")
    try:
        literal = ipaddress.ip_address(hostname)
    except ValueError:
        return hostname
    if not _is_public_ip(literal):
        raise UnsafeURLError("URL points to a private or reserved IP address.")
    return hostname


async def assert_public_url(url: str) -> None:
    """Reject URLs whose hostname resolves to any non-public address.

    Resolving here (and not only checking literal IPs) defeats domain names
    that point at internal services.
    """
    hostname = validate_url_syntax(url)
    try:
        ipaddress.ip_address(hostname)
        return  # literal public IP, already validated
    except ValueError:
        pass

    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeURLError("URL hostname could not be resolved.") from exc

    for info in infos:
        resolved = ipaddress.ip_address(info[4][0])
        if not _is_public_ip(resolved):
            raise UnsafeURLError("URL resolves to a private or reserved IP address.")
