"""Playback use cases.

Playback links are temporary: they are resolved right before the player is
started and are never persisted.
"""

from __future__ import annotations

from anime_app.core.exceptions import ValidationError
from anime_app.domain.anime.entities import AnimeRepository
from anime_app.domain.episode.models import (
    EpisodeSource,
    InvalidEpisodeIdError,
    PlaybackOption,
    decode_episode_id,
)
from anime_app.domain.providers.registry import ProviderRegistry

__all__ = ["PlaybackService"]


class PlaybackService:
    """Resolve the playable sources of an episode."""

    def __init__(self, registry: ProviderRegistry, anime_repository: AnimeRepository) -> None:
        """Create the service.

        Args:
            registry: The provider registry.
            anime_repository: Storage of the local catalogue, used to resolve
                the title of a provider entry.
        """
        self._registry = registry
        self._anime = anime_repository

    async def get_sources(self, episode_id: str) -> list[EpisodeSource]:
        """Return the playable sources of an episode.

        Raises:
            ValidationError: if the episode identifier is malformed.
            NotFoundError: if the provider is unknown or disabled.
        """
        provider_id, anime_external_id, episode_external_id = self._decode(episode_id)
        provider = self._registry.get_playback(provider_id)
        title_hint = await self._title_hint(provider_id, anime_external_id)
        return await provider.get_sources(
            anime_external_id,
            episode_external_id,
            title_hint=title_hint,
        )

    async def get_playback_options(
        self,
        episode_id: str,
        source_key: str,
    ) -> list[PlaybackOption]:
        """Resolve the playable streams of a single source.

        Raises:
            ValidationError: if the episode identifier is malformed.
            NotFoundError: if the provider is unknown or disabled.
        """
        provider_id, anime_external_id, episode_external_id = self._decode(episode_id)
        provider = self._registry.get_playback(provider_id)
        title_hint = await self._title_hint(provider_id, anime_external_id)
        return await provider.get_playback_options(
            anime_external_id,
            episode_external_id,
            source_key,
            title_hint=title_hint,
        )

    @staticmethod
    def _decode(episode_id: str) -> tuple[str, str, str]:
        """Decode an episode identifier into its components."""
        try:
            return decode_episode_id(episode_id)
        except InvalidEpisodeIdError as exc:
            raise ValidationError("malformed episode id") from exc

    async def _title_hint(self, provider_id: str, anime_external_id: str) -> str | None:
        """Return the stored title of a provider entry, when it is known."""
        try:
            record = await self._anime.get_by_external_ref(provider_id, anime_external_id)
        except Exception:  # noqa: BLE001 - the hint is optional
            return None
        return record.canonical_title if record else None
