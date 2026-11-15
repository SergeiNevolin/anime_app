"""Anime catalogue endpoints."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from anime_app.api.dependencies import AnimeServiceDep, CurrentUser, get_search_rate_limiter
from anime_app.core.pagination import Page, PageParams
from anime_app.core.ratelimit import RateLimiter
from anime_app.domain.anime.models import AnimeDetails, AnimeSummary
from anime_app.domain.episode.models import AnimeEpisode

__all__ = ["router"]

router = APIRouter(prefix="/anime", tags=["anime"])


@router.get("/search", response_model=Page[AnimeSummary], summary="Search for anime")
async def search_anime(
    service: AnimeServiceDep,
    user: CurrentUser,
    limiter: Annotated[RateLimiter, Depends(get_search_rate_limiter)],
    query: Annotated[str, Query(min_length=2, max_length=128, description="Search term")],
    provider: Annotated[str | None, Query(description="Filter by provider ID")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[AnimeSummary]:
    """Search the catalogue of every enabled provider."""
    await limiter.check(str(user.telegram_id), scope="search")
    return await service.search(query, PageParams(page=page, page_size=page_size), provider=provider)


@router.get("/{anime_id}", response_model=AnimeDetails, summary="Return the details of an anime")
async def read_anime(anime_id: UUID, service: AnimeServiceDep, user: CurrentUser) -> AnimeDetails:
    """Return the details of a single catalog entry."""
    return await service.get_details(anime_id)


@router.get(
    "/{anime_id}/episodes",
    response_model=Page[AnimeEpisode],
    summary="Return the episodes of an anime",
)
async def read_anime_episodes(
    anime_id: UUID,
    service: AnimeServiceDep,
    user: CurrentUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[AnimeEpisode]:
    """Return the episode list of a single catalog entry."""
    return await service.get_episodes(anime_id, PageParams(page=page, page_size=page_size))
