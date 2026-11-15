"""Composition root.

The container wires the infrastructure adapters to the application services.
It is the only place that knows about concrete implementations; every other
module depends on the interfaces.
"""

from __future__ import annotations

from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from anime_app.application.anime.service import AnimeService
from anime_app.application.auth.service import AuthService
from anime_app.application.library.service import LibraryService
from anime_app.application.playback.service import PlaybackService
from anime_app.config import Settings
from anime_app.core.logging import get_logger
from anime_app.core.security.telegram import InitDataValidator
from anime_app.domain.providers.base import ProviderInfo, ProviderKind
from anime_app.domain.providers.registry import ProviderRegistry
from anime_app.infrastructure.cache.base import Cache, NullCache
from anime_app.infrastructure.cache.redis_cache import RedisCache
from anime_app.infrastructure.database.repositories import (
    SqlAlchemyAnimeRepository,
    SqlAlchemyLibraryRepository,
    SqlAlchemyUserRepository,
)
from anime_app.infrastructure.database.session import create_engine, create_session_factory
from anime_app.infrastructure.providers.anicli.adapter import (
    DEFAULT_HEADERS,
    build_providers,
)
from anime_app.infrastructure.providers.fixtures.provider import FixtureProvider
from anime_app.infrastructure.telegram.auth import DevAuthProvider, TelegramAuthProvider

__all__ = ["FIXTURE_PROVIDER_ID", "AppContainer", "build_container"]

FIXTURE_PROVIDER_ID = FixtureProvider.provider_id

logger = get_logger(__name__)


class AppContainer:
    """Holds every long lived object of the application."""

    def __init__(
        self,
        settings: Settings,
        engine: AsyncEngine,
        session_factory: async_sessionmaker[AsyncSession],
        cache: Cache,
        registry: ProviderRegistry,
        http_client: httpx.AsyncClient,
        auth_providers: list[Any],
    ) -> None:
        """Create the container."""
        self.settings = settings
        self.engine = engine
        self.session_factory = session_factory
        self.cache = cache
        self.registry = registry
        self.http_client = http_client
        self.auth_providers = auth_providers

    # -- repositories -----------------------------------------------------

    def user_repository(self, session: AsyncSession) -> SqlAlchemyUserRepository:
        """Return the user repository bound to ``session``."""
        return SqlAlchemyUserRepository(session)

    def anime_repository(self, session: AsyncSession) -> SqlAlchemyAnimeRepository:
        """Return the anime repository bound to ``session``."""
        return SqlAlchemyAnimeRepository(session)

    def library_repository(self, session: AsyncSession) -> SqlAlchemyLibraryRepository:
        """Return the library repository bound to ``session``."""
        return SqlAlchemyLibraryRepository(session)

    # -- services ---------------------------------------------------------

    def auth_service(self, session: AsyncSession) -> AuthService:
        """Return the authentication service bound to ``session``."""
        return AuthService(self.user_repository(session), self.auth_providers)

    def anime_service(self, session: AsyncSession) -> AnimeService:
        """Return the anime service bound to ``session``."""
        return AnimeService(
            self.registry,
            self.anime_repository(session),
            self.cache,
            search_limit=self.settings.provider_search_limit,
            cache_ttl_search=self.settings.cache_ttl_search,
            cache_ttl_details=self.settings.cache_ttl_details,
            cache_ttl_episodes=self.settings.cache_ttl_episodes,
        )

    def playback_service(self, session: AsyncSession) -> PlaybackService:
        """Return the playback service bound to ``session``."""
        return PlaybackService(self.registry, self.anime_repository(session))

    def library_service(self, session: AsyncSession) -> LibraryService:
        """Return the library service bound to ``session``."""
        return LibraryService(self.library_repository(session), self.anime_repository(session))

    # -- lifecycle --------------------------------------------------------

    async def aclose(self) -> None:
        """Release every resource held by the container."""
        await self.http_client.aclose()
        await self.engine.dispose()
        close = getattr(self.cache, "close", None)
        if close is not None:
            await close()


def _create_http_client(settings: Settings) -> httpx.AsyncClient:
    """Create the HTTP client used for the external requests."""
    timeout = httpx.Timeout(
        settings.provider_timeout,
        connect=settings.provider_connect_timeout,
    )
    limits = httpx.Limits(max_connections=20, max_keepalive_connections=10)
    return httpx.AsyncClient(
        headers=DEFAULT_HEADERS,
        timeout=timeout,
        limits=limits,
        follow_redirects=True,
    )


def _register_providers(
    registry: ProviderRegistry,
    settings: Settings,
    http_client: httpx.AsyncClient,
) -> None:
    """Register every available provider in the registry."""
    for provider in build_providers(http_client, timeout=settings.provider_timeout):
        info = ProviderInfo(
            id=provider.provider_id,
            name=provider.display_name,
            kind=ProviderKind.CATALOG,
            enabled=True,
            supports_search=provider.supports_search,
            supports_episodes=provider.supports_episodes,
            supports_playback=provider.supports_playback,
            notes=provider.notes,
        )
        registry.register(info, catalog=provider, playback=provider)

    # The deterministic provider is registered only when it is explicitly
    # allowed, which happens exclusively in the test environment.
    if registry.is_allowed(FIXTURE_PROVIDER_ID):
        fixture = FixtureProvider()
        registry.register(
            ProviderInfo(
                id=fixture.provider_id,
                name=fixture.display_name,
                kind=ProviderKind.CATALOG,
                enabled=True,
                supports_search=True,
                supports_episodes=True,
                supports_playback=True,
                notes=fixture.notes,
            ),
            catalog=fixture,
            playback=fixture,
        )


def _build_auth_providers(settings: Settings) -> list[Any]:
    """Build the credential providers.

    The development provider is only registered outside of production and
    only when it was explicitly enabled.
    """
    providers: list[Any] = []
    token = settings.telegram_token_value
    if token:
        providers.append(
            TelegramAuthProvider(
                InitDataValidator(
                    token,
                    max_age_seconds=settings.telegram_init_data_max_age,
                    clock_skew_seconds=settings.telegram_clock_skew,
                )
            )
        )
    else:
        logger.warning("TELEGRAM_BOT_TOKEN is not configured: Telegram login is disabled")

    if settings.dev_auth_enabled:
        if settings.is_production:
            logger.error("the development authentication provider is disabled in production")
        else:
            providers.append(
                DevAuthProvider(
                    telegram_id=settings.dev_auth_telegram_id,
                    username=settings.dev_auth_username,
                )
            )
    return providers


async def build_container(settings: Settings) -> AppContainer:
    """Create the application container."""
    engine = create_engine(settings)
    session_factory = create_session_factory(engine)
    http_client = _create_http_client(settings)

    cache: Cache = NullCache()
    redis_cache: RedisCache | None = None
    if settings.cache_enabled and settings.redis_url:
        try:
            from redis.asyncio import Redis  # noqa: PLC0415 - optional dependency

            client = Redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
            redis_cache = RedisCache(client)
            if not await redis_cache.ping():
                logger.warning("Redis is not reachable: the cache runs in degraded mode")
                await redis_cache.close()
                redis_cache = None
        except Exception:
            logger.exception("failed to connect to Redis: the cache runs in degraded mode")
            redis_cache = None
    if redis_cache is not None:
        cache = redis_cache

    registry = ProviderRegistry(settings.allowed_providers)
    _register_providers(registry, settings, http_client)
    enabled = [info.id for info in registry.describe() if info.enabled]
    logger.info("registered providers: %s", ", ".join(enabled) or "none")

    return AppContainer(
        settings=settings,
        engine=engine,
        session_factory=session_factory,
        cache=cache,
        registry=registry,
        http_client=http_client,
        auth_providers=_build_auth_providers(settings),
    )
