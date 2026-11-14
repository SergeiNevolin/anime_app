"""Cache infrastructure."""

from anime_app.infrastructure.cache.base import Cache, NullCache
from anime_app.infrastructure.cache.redis_cache import RedisCache

__all__ = ["Cache", "NullCache", "RedisCache"]
