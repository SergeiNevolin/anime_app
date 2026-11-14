"""Rate limiting based on a fixed window counter stored in Redis."""

from __future__ import annotations

from anime_app.core.exceptions import RateLimitError
from anime_app.core.logging import get_logger
from anime_app.infrastructure.cache.base import Cache

__all__ = ["RateLimiter"]

logger = get_logger(__name__)


class RateLimiter:
    """A fixed window rate limiter.

    The limiter degrades gracefully: when the cache is unavailable the
    requests are allowed through, because availability is more important than
    a strict limit for a read heavy API.
    """

    def __init__(self, cache: Cache, *, limit: int, window: int, namespace: str = "rl") -> None:
        """Create the limiter.

        Args:
            cache: Cache used to store the counters.
            limit: Maximum number of requests per window.
            window: Length of the window in seconds.
            namespace: Prefix of the counter keys.
        """
        self._cache = cache
        self._limit = limit
        self._window = window
        self._namespace = namespace

    async def check(self, identity: str, *, scope: str = "global") -> None:
        """Register a request and raise when the limit is exceeded.

        Args:
            identity: Identifier of the caller (user id, IP address, ...).
            scope: Namespace of the limit, used to have separate budgets.

        Raises:
            RateLimitError: when the caller exceeded the limit.
        """
        if self._limit <= 0:
            return
        key = f"{self._namespace}:{scope}:{identity}"
        counter = await self._cache.increment(key, ttl=self._window)
        if counter == 0:
            # The cache is unavailable: fail open.
            return
        if counter > self._limit:
            logger.info("rate limit exceeded for %s (scope=%s)", identity, scope)
            raise RateLimitError(retry_after=self._window)
