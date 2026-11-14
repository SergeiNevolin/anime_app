"""Episode and playback endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from anime_app.api.dependencies import CurrentUser, PlaybackServiceDep
from anime_app.domain.episode.models import EpisodeSource, PlaybackOption

__all__ = ["router"]

router = APIRouter(prefix="/episodes", tags=["episodes"])


@router.get(
    "/{episode_id}/sources",
    response_model=list[EpisodeSource],
    summary="Return the playable sources of an episode",
)
async def read_episode_sources(
    episode_id: str,
    service: PlaybackServiceDep,
    user: CurrentUser,
) -> list[EpisodeSource]:
    """Return every player and dubbing combination of an episode."""
    return await service.get_sources(episode_id)


@router.get(
    "/{episode_id}/sources/{source_key}/playback",
    response_model=list[PlaybackOption],
    summary="Resolve the playable streams of a source",
)
async def read_episode_playback(
    episode_id: str,
    source_key: str,
    service: PlaybackServiceDep,
    user: CurrentUser,
) -> list[PlaybackOption]:
    """Resolve the direct links of a source.

    The links are temporary and are resolved right before the playback starts.
    """
    return await service.get_playback_options(episode_id, source_key)
