"""Provider interfaces (ports) implemented by the infrastructure adapters."""

from __future__ import annotations

from enum import StrEnum
from typing import Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict

from anime_app.domain.anime.models import AnimeDetails, AnimeSummary
from anime_app.domain.episode.models import AnimeEpisode, EpisodeSource, PlaybackOption

__all__ = [
    "AnimeCatalogProvider",
    "PlaybackProvider",
    "ProviderInfo",
    "ProviderKind",
]


class ProviderKind(StrEnum):
    """The role a provider plays inside the application."""

    CATALOG = "catalog"
    PLAYBACK = "playback"


class ProviderInfo(BaseModel):
    """Descriptive information about a registered provider."""

    model_config = ConfigDict(frozen=True)

    id: str
    name: str
    kind: ProviderKind = ProviderKind.CATALOG
    enabled: bool = True
    supports_search: bool = False
    supports_episodes: bool = False
    supports_playback: bool = False
    notes: str | None = None


@runtime_checkable
class AnimeCatalogProvider(Protocol):
    """A source of anime metadata (search, details, episodes)."""

    @property
    def provider_id(self) -> str:
        """Unique, stable identifier of the provider."""
        ...

    @property
    def display_name(self) -> str:
        """Human readable name of the provider."""
        ...

    async def search(self, query: str, *, limit: int, offset: int) -> list[AnimeSummary]:
        """Search for anime matching ``query``."""
        ...

    async def get_details(self, external_id: str, *, title_hint: str | None = None) -> AnimeDetails:
        """Return the details of a single title.

        Args:
            external_id: Provider scoped identifier of the title.
            title_hint: Optional title used by sources that cannot be queried
                by identifier alone.
        """
        ...

    async def get_episodes(
        self,
        external_id: str,
        *,
        title_hint: str | None = None,
    ) -> list[AnimeEpisode]:
        """Return the episode list of a single title."""
        ...


@runtime_checkable
class PlaybackProvider(Protocol):
    """A source of playable streams for episodes."""

    @property
    def provider_id(self) -> str:
        """Unique, stable identifier of the provider."""
        ...

    @property
    def display_name(self) -> str:
        """Human readable name of the provider."""
        ...

    async def get_sources(
        self,
        anime_external_id: str,
        episode_external_id: str,
        *,
        title_hint: str | None = None,
    ) -> list[EpisodeSource]:
        """Return the playable sources of an episode."""
        ...

    async def get_playback_options(
        self,
        anime_external_id: str,
        episode_external_id: str,
        source_key: str,
        *,
        title_hint: str | None = None,
    ) -> list[PlaybackOption]:
        """Resolve the playable streams of a single source."""
        ...
