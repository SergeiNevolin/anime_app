"""FastAPI dependencies.

The dependencies resolve the long lived objects from the application state
and bind the repositories to the database session of the current request.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from anime_app.application.anime.service import AnimeService
from anime_app.application.auth.service import AuthService
from anime_app.application.library.service import LibraryService
from anime_app.application.playback.service import PlaybackService
from anime_app.container import AppContainer
from anime_app.core.ratelimit import RateLimiter
from anime_app.domain.providers.registry import ProviderRegistry
from anime_app.domain.user.models import GUEST_TELEGRAM_ID, User

__all__ = [
    "get_anime_service",
    "get_auth_service",
    "get_container",
    "get_current_user",
    "get_library_service",
    "get_playback_service",
    "get_rate_limiter",
    "get_registry",
    "get_session",
]


def get_container(request: Request) -> AppContainer:
    """Return the application container."""
    container: AppContainer = request.app.state.container
    return container


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Yield a database session bound to the request."""
    container = get_container(request)
    async with container.session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def get_registry(request: Request) -> ProviderRegistry:
    """Return the provider registry."""
    return get_container(request).registry


def get_rate_limiter(request: Request) -> RateLimiter:
    """Return the global rate limiter."""
    container = get_container(request)
    settings = container.settings
    return RateLimiter(
        container.cache,
        limit=settings.rate_limit_requests,
        window=settings.rate_limit_window,
        namespace="rl:global",
    )


def get_search_rate_limiter(request: Request) -> RateLimiter:
    """Return the rate limiter dedicated to the search endpoint."""
    container = get_container(request)
    settings = container.settings
    return RateLimiter(
        container.cache,
        limit=settings.search_rate_limit_requests,
        window=settings.search_rate_limit_window,
        namespace="rl:search",
    )


def get_auth_service(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AuthService:
    """Return the authentication service."""
    return get_container(request).auth_service(session)


def get_anime_service(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AnimeService:
    """Return the anime service."""
    return get_container(request).anime_service(session)


def get_playback_service(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PlaybackService:
    """Return the playback service."""
    return get_container(request).playback_service(session)


def get_library_service(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> LibraryService:
    """Return the library service."""
    return get_container(request).library_service(session)


async def get_current_user(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    """Return the authenticated user, or the shared guest account.

    The ``Authorization`` header is optional.  A valid Telegram ``initData``
    identifies the user; a request without credentials (or with a credential
    that cannot be used) is served as the guest, so the application stays
    usable outside Telegram.
    """
    container = get_container(request)
    authorization = request.headers.get("Authorization")
    user = await container.auth_service(session).authenticate_optional(authorization)
    if user is not None:
        return user

    # TODO: drop the shared guest account.  Every anonymous visitor is served
    # from the same ``users`` row, so guests see and modify each other's
    # library.  Replace it with a per-device guest identity (signed cookie) or
    # keep the guest data out of the database entirely.
    repo = container.user_repository(session)
    guest = await repo.get_or_create(
        telegram_id=GUEST_TELEGRAM_ID,
        username="anonymous",
        first_name="Anonymous",
        language_code="ru",
    )
    await repo.touch(guest.id)
    return guest


CurrentUser = Annotated[User, Depends(get_current_user)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]
AnimeServiceDep = Annotated[AnimeService, Depends(get_anime_service)]
PlaybackServiceDep = Annotated[PlaybackService, Depends(get_playback_service)]
LibraryServiceDep = Annotated[LibraryService, Depends(get_library_service)]
RegistryDep = Annotated[ProviderRegistry, Depends(get_registry)]
