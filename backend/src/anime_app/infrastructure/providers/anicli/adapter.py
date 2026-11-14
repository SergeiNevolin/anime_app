"""Adapter that exposes the ``anicli-api`` extractors through our own ports.

The adapter is the *only* place in the code base that knows about the
``anicli_api`` package.  It

* owns the HTTP client used for the external requests (so that timeouts and
  limits are configured by this application and not by the library),
* translates the library objects into the domain DTOs,
* normalises every failure into the application error hierarchy.

The HTTP client is created by this application on purpose: ``anicli-api``
ships its own clients with an aggressive retry loop and an automated
bot-protection workaround, which this application does not want.
"""

from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator
from typing import Any

import httpx

from anime_app.core.exceptions import (
    ProviderError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)
from anime_app.core.logging import get_logger
from anime_app.domain.anime.models import AnimeDetails, AnimeGenre, AnimeSummary
from anime_app.domain.episode.models import (
    AnimeEpisode,
    EpisodeSource,
    PlaybackKind,
    PlaybackOption,
)
from anime_app.domain.episode.models import source_key as make_source_key
from anime_app.infrastructure.providers.anicli.sources import (
    AnicliSourceAdapter,
    LoadedAnime,
    RawMetadata,
    build_adapters,
)

__all__ = ["DEFAULT_HEADERS", "AnicliApiProvider", "build_providers"]

logger = get_logger(__name__)

DEFAULT_HEADERS: dict[str, str] = {
    "User-Agent": (
        "Mozilla/5.0 (Linux; Android 10.0; Nexus 5 Build/MRA58N) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36"
    ),
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
}

ALLOWED_STREAM_HEADERS = frozenset(
    {"user-agent", "referer", "referrer", "origin", "accept-language", "accept"}
)

VIDEO_KIND_MAP: dict[str, PlaybackKind] = {
    "m3u8": PlaybackKind.HLS,
    "mp4": PlaybackKind.MP4,
    "mpd": PlaybackKind.DASH,
    "webm": PlaybackKind.MP4,
}


class AnicliApiProvider:
    """Catalog and playback provider backed by ``anicli-api``."""

    def __init__(
        self,
        adapter: AnicliSourceAdapter,
        http_client: httpx.AsyncClient,
        *,
        timeout: float = 20.0,
    ) -> None:
        """Create the provider.

        Args:
            adapter: The source specific adapter.
            http_client: The shared HTTP client used for the requests.
            timeout: Per request timeout in seconds.
        """
        self._adapter = adapter
        self._http = http_client
        self._timeout = timeout
        self._extractor: Any = None

    # -- identity --------------------------------------------------------

    @property
    def provider_id(self) -> str:
        """Unique identifier of the provider."""
        return self._adapter.id

    @property
    def display_name(self) -> str:
        """Human readable name of the provider."""
        return self._adapter.display_name

    @property
    def notes(self) -> str | None:
        """Additional information about the provider."""
        return self._adapter.notes or None

    @property
    def supports_search(self) -> bool:
        """Whether the provider supports searching."""
        return self._adapter.supports_search

    @property
    def supports_episodes(self) -> bool:
        """Whether the provider exposes episode lists."""
        return self._adapter.supports_episodes

    @property
    def supports_playback(self) -> bool:
        """Whether the provider exposes playable streams."""
        return self._adapter.supports_playback

    # -- internals -------------------------------------------------------

    def _get_extractor(self) -> Any:
        """Return (and memoise) the ``anicli-api`` extractor instance."""
        if self._extractor is None:
            extractor_class = self._adapter._extractor_class()
            self._extractor = extractor_class(http_async_client=self._http)
        return self._extractor

    @contextlib.asynccontextmanager
    async def _guard(self) -> AsyncIterator[None]:
        """Normalise every failure of the external library."""
        try:
            yield
        except (ProviderError, ProviderTimeoutError, ProviderUnavailableError):
            raise
        except httpx.TimeoutException as exc:
            logger.warning("provider %s timed out", self.provider_id)
            raise ProviderTimeoutError(f"provider {self.provider_id!r} timed out") from exc
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "provider %s returned HTTP %s", self.provider_id, exc.response.status_code
            )
            raise ProviderUnavailableError(
                f"provider {self.provider_id!r} returned an unexpected status"
            ) from exc
        except httpx.HTTPError as exc:
            logger.warning("provider %s failed: %s", self.provider_id, exc)
            raise ProviderUnavailableError(
                f"provider {self.provider_id!r} is temporarily unavailable"
            ) from exc
        except Exception as exc:
            logger.exception("provider %s raised an unexpected error", self.provider_id)
            raise ProviderError(
                f"provider {self.provider_id!r} failed: {type(exc).__name__}"
            ) from exc

    async def _load(
        self,
        external_id: str,
        title_hint: str | None = None,
    ) -> LoadedAnime:
        """Load a catalog entry, raising when it cannot be resolved."""
        async with self._guard():
            loaded = await self._adapter.load(self._http, external_id, title_hint=title_hint)
        if loaded is None:
            raise ProviderUnavailableError(
                f"provider {self.provider_id!r} did not return the requested title"
            )
        return loaded

    def _summary(self, loaded: LoadedAnime) -> AnimeSummary:
        """Convert the provider metadata into a domain summary."""
        metadata: RawMetadata = loaded.metadata
        return AnimeSummary(
            provider=self.provider_id,
            external_id=loaded.external_id,
            title=metadata.title or loaded.external_id,
            original_title=metadata.original_title,
            alternative_title=metadata.alternative_title,
            alternative_titles=list(metadata.alternative_titles),
            poster_url=metadata.poster_url or metadata.thumbnail,
            year=metadata.year,
            genres=[AnimeGenre(name=genre) for genre in metadata.genres],
            total_episodes=metadata.total_episodes,
            release_status=metadata.release_status,
            description=metadata.description,
            dubbing_teams=list(metadata.dubbing_teams),
            external_url=self._adapter.official_url(loaded.external_id),
        )

    async def _episodes(self, loaded: LoadedAnime) -> list[Any]:
        """Return the raw episode objects of a loaded catalog entry."""
        anime = loaded.anime
        if anime is None:
            return []
        async with self._guard():
            episodes = await anime.a_get_episodes()
        return list(episodes or [])

    async def _find_episode(
        self,
        loaded: LoadedAnime,
        episode_external_id: str,
    ) -> Any:
        """Return the raw episode object matching ``episode_external_id``."""
        for episode in await self._episodes(loaded):
            if self._adapter.episode_external_id(episode) == episode_external_id:
                return episode
        raise ProviderUnavailableError(
            f"episode {episode_external_id!r} is not available on provider {self.provider_id!r}"
        )

    async def _sources(self, episode: Any) -> list[Any]:
        """Return the raw source objects of an episode."""
        async with self._guard():
            sources = await episode.a_get_sources()
        return list(sources or [])

    # -- catalog port ----------------------------------------------------

    async def search(self, query: str, *, limit: int, offset: int) -> list[AnimeSummary]:
        """Search for anime matching ``query``."""
        async with self._guard():
            results = await self._get_extractor().a_search(query)
        summaries: list[AnimeSummary] = []
        for result in list(results or []):
            try:
                metadata = self._adapter.metadata(result)
                external_id = self._adapter.external_id(result)
            except Exception:
                logger.exception("provider %s returned an unusable search item", self.provider_id)
                continue
            if not metadata.title or not external_id:
                continue
            summaries.append(
                AnimeSummary(
                    provider=self.provider_id,
                    external_id=external_id,
                    title=metadata.title,
                    original_title=metadata.original_title,
                    alternative_title=metadata.alternative_title,
                    alternative_titles=list(metadata.alternative_titles),
                    poster_url=metadata.poster_url or metadata.thumbnail,
                    year=metadata.year,
                    genres=[AnimeGenre(name=genre) for genre in metadata.genres],
                    total_episodes=metadata.total_episodes,
                    release_status=metadata.release_status,
                    description=metadata.description,
                    dubbing_teams=list(metadata.dubbing_teams),
                    external_url=self._adapter.official_url(external_id),
                )
            )
        return summaries[offset : offset + limit] if limit > 0 else summaries[offset:]

    async def get_details(
        self,
        external_id: str,
        *,
        title_hint: str | None = None,
    ) -> AnimeDetails:
        """Return the details of a single title."""
        loaded = await self._load(external_id, title_hint)
        summary = self._summary(loaded)
        details = AnimeDetails(**summary.model_dump())
        details.available_providers = [self.provider_id]
        return details

    async def get_episodes(
        self,
        external_id: str,
        *,
        title_hint: str | None = None,
    ) -> list[AnimeEpisode]:
        """Return the episode list of a single title."""
        loaded = await self._load(external_id, title_hint)
        episodes = await self._episodes(loaded)
        result: list[AnimeEpisode] = []
        for episode in episodes:
            ordinal = getattr(episode, "ordinal", None)
            number = int(ordinal) if isinstance(ordinal, int) else len(result) + 1
            result.append(
                AnimeEpisode(
                    provider=self.provider_id,
                    anime_external_id=loaded.external_id,
                    external_id=self._adapter.episode_external_id(episode),
                    number=number,
                    title=self._adapter.episode_title(episode),
                )
            )
        result.sort(key=lambda item: item.number)
        return result

    # -- playback port ---------------------------------------------------

    async def get_sources(
        self,
        anime_external_id: str,
        episode_external_id: str,
        *,
        title_hint: str | None = None,
    ) -> list[EpisodeSource]:
        """Return the playable sources of an episode."""
        loaded = await self._load(anime_external_id, title_hint)
        episode = await self._find_episode(loaded, episode_external_id)
        sources = await self._sources(episode)
        official = self._adapter.official_url(anime_external_id)
        result: list[EpisodeSource] = []
        for source in sources:
            url = getattr(source, "url", None)
            title = self._adapter.episode_source_title(source)
            key = make_source_key(title, url or "")
            result.append(
                EpisodeSource(
                    provider=self.provider_id,
                    key=key,
                    title=title,
                    player=self._player_name(url),
                    external_url=url if isinstance(url, str) and url.startswith("http") else None,
                    official_url=official,
                )
            )
        return result

    async def get_playback_options(
        self,
        anime_external_id: str,
        episode_external_id: str,
        source_key: str,
        *,
        title_hint: str | None = None,
    ) -> list[PlaybackOption]:
        """Resolve the playable streams of a single source."""
        loaded = await self._load(anime_external_id, title_hint)
        episode = await self._find_episode(loaded, episode_external_id)
        sources = await self._sources(episode)
        selected: Any = None
        selected_title = ""
        for source in sources:
            url = getattr(source, "url", None)
            title = self._adapter.episode_source_title(source)
            if make_source_key(title, url or "") == source_key:
                selected = source
                selected_title = title
                break
        if selected is None:
            raise ProviderUnavailableError(
                f"source {source_key!r} is not available on provider {self.provider_id!r}"
            )
        async with self._guard():
            videos = await selected.a_get_videos(timeout=self._timeout)
        official = self._adapter.official_url(anime_external_id)
        options: list[PlaybackOption] = []
        for video in list(videos or []):
            kind = VIDEO_KIND_MAP.get(getattr(video, "type", ""))
            url = getattr(video, "url", None)
            if kind is None or not isinstance(url, str) or not url:
                continue
            options.append(
                PlaybackOption(
                    provider=self.provider_id,
                    source_key=source_key,
                    source_title=selected_title,
                    kind=kind,
                    quality=int(getattr(video, "quality", 0) or 0),
                    url=url,
                    headers=self._filter_headers(getattr(video, "headers", None)),
                    official_url=official,
                )
            )
        options.sort(key=lambda item: item.quality, reverse=True)
        return options

    # -- helpers ---------------------------------------------------------

    @staticmethod
    def _filter_headers(headers: Any) -> dict[str, str]:
        """Keep only the headers that are safe to forward to the client."""
        if not isinstance(headers, dict):
            return {}
        return {
            str(name): str(value)
            for name, value in headers.items()
            if str(name).lower() in ALLOWED_STREAM_HEADERS
        }

    @staticmethod
    def _player_name(url: str | None) -> str:
        """Derive a readable player name from the player URL."""
        if not url or not url.startswith("http"):
            return "unknown"
        host = url.split("/")[2].lower()
        for known in ("kodik", "aniboom", "aksor", "sibnet", "animetop", "libria", "yummyani"):
            if known in host:
                return known
        return host


def build_providers(
    http_client: httpx.AsyncClient,
    *,
    timeout: float = 20.0,
) -> list[AnicliApiProvider]:
    """Create one provider instance per known ``anicli-api`` source."""
    return [
        AnicliApiProvider(adapter, http_client, timeout=timeout) for adapter in build_adapters()
    ]
