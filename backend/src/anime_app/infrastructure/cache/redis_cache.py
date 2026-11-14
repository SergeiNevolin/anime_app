"""Redis backed cache implementation."""

from __future__ import annotations

from redis.asyncio import Redis
from redis.exceptions import RedisError

from anime_app.core.logging import get_logger

__all__ = ["RedisCache"]

logger = get_logger(__name__)


class RedisCache:
    """Cache implementation backed by Redis.

    Every operation swallows Redis errors and logs them: a cache outage must
    never turn into a request failure.
    """

    def __init__(self, client: Redis, *, namespace: str = "anime") -> None:
        """Create the cache.

        Args:
            client: A configured ``redis.asyncio.Redis`` client.
            namespace: Prefix applied to every key.
        """
        self._client = client
        self._namespace = namespace

    def _key(self, key: str) -> str:
        return f"{self._namespace}:{key}"

    async def get(self, key: str) -> str | None:
        """Return the cached value or ``None``."""
        try:
            value = await self._client.get(self._key(key))
        except RedisError as exc:
            logger.warning("cache read failed: %s", exc)
            return None
        return value if isinstance(value, str) else None

    async def set(self, key: str, value: str, *, ttl: int) -> None:
        """Store a value with the given time to live in seconds."""
        if ttl <= 0:
            return
        try:
            await self._client.set(self._key(key), value, ex=ttl)
        except RedisError as exc:
            logger.warning("cache write failed: %s", exc)

    async def delete(self, key: str) -> None:
        """Remove a key from the cache."""
        try:
            await self._client.delete(self._key(key))
        except RedisError as exc:
            logger.warning("cache delete failed: %s", exc)

    async def increment(self, key: str, *, ttl: int) -> int:
        """Increment a counter, applying ``ttl`` when the counter is created."""
        try:
            value = int(await self._client.incr(self._key(key)))
            if value == 1 and ttl > 0:
                await self._client.expire(self._key(key), ttl)
            return value
        except RedisError as exc:
            logger.warning("cache increment failed: %s", exc)
            return 0

    async def ping(self) -> bool:
        """Return whether Redis answers a ping."""
        try:
            return bool(await self._client.ping())
        except RedisError:
            return False

    async def close(self) -> None:
        """Close the underlying client."""
        try:
            await self._client.aclose()
        except RedisError as exc:  # pragma: no cover - defensive
            logger.warning("cache close failed: %s", exc)
