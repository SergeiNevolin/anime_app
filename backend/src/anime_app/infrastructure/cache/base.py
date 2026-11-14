"""Cache port.

The cache is an optimisation, never a source of truth.  Every implementation
must therefore be able to degrade gracefully: when Redis is unavailable the
application keeps working, only slower.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

__all__ = ["Cache", "NullCache"]


@runtime_checkable
class Cache(Protocol):
    """Minimal key/value cache interface used by the application services."""

    async def get(self, key: str) -> str | None:
        """Return the cached value or ``None``."""
        ...

    async def set(self, key: str, value: str, *, ttl: int) -> None:
        """Store a value with the given time to live in seconds."""
        ...

    async def delete(self, key: str) -> None:
        """Remove a key from the cache."""
        ...

    async def increment(self, key: str, *, ttl: int) -> int:
        """Increment a counter and return its new value."""
        ...

    async def ping(self) -> bool:
        """Return whether the cache backend is reachable."""
        ...


class NullCache:
    """A cache implementation that stores nothing.

    Used when Redis is disabled or unreachable, so that the application keeps
    working in a degraded mode.
    """

    async def get(self, key: str) -> str | None:
        """Always return ``None``."""
        return None

    async def set(self, key: str, value: str, *, ttl: int) -> None:
        """Ignore the write."""

    async def delete(self, key: str) -> None:
        """Ignore the delete."""

    async def increment(self, key: str, *, ttl: int) -> int:
        """Always return ``0``."""
        return 0

    async def ping(self) -> bool:
        """Always report the cache as reachable (it is a no-op)."""
        return True
