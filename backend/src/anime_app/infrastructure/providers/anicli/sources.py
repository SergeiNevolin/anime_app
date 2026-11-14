"""Per-source knowledge about the ``anicli-api`` extractors.

Every external source has its own payload shape.  Instead of spreading that
knowledge over the whole application, each source is described by a small
adapter class that knows how to

* read the metadata of a search result,
* load a catalog entry by its provider scoped identifier,
* derive the identifier of a single episode,
* build a link to the public page of a title.

All access is defensive: a missing or reshaped field degrades the metadata
instead of breaking the request.
"""

from __future__ import annotations

import importlib
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from anime_app.core.exceptions import ProviderUnavailableError
from anime_app.core.logging import get_logger
from anime_app.domain.anime.models import ReleaseStatus

__all__ = [
    "AniLibertyAdapter",
    "AnicliSourceAdapter",
    "AnimeGoAdapter",
    "AnimeVostAdapter",
    "AnimelibAdapter",
    "LoadedAnime",
    "RawMetadata",
    "YummyAnimeAdapter",
    "build_adapters",
]

logger = get_logger(__name__)


def dig(data: Any, *path: str, default: Any = None) -> Any:
    """Safely walk a nested mapping.

    Args:
        data: The mapping to walk.
        path: The keys to follow.
        default: Value returned when the path does not exist.

    Returns:
        The value found at ``path`` or ``default``.
    """
    current = data
    for key in path:
        if not isinstance(current, dict):
            return default
        current = current.get(key)
        if current is None:
            return default
    return current


def as_int(value: Any) -> int | None:
    """Convert ``value`` to an int, returning ``None`` when impossible."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        text = value.strip()
        if text.isdigit():
            return int(text)
        head = text.split(".")[0]
        if head.isdigit():
            return int(head)
    return None


def parse_year(value: Any) -> int | None:
    """Extract a year from a date like ``1998`` or ``1998-04-03``."""
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if not isinstance(value, str):
        return None
    text = value.strip()
    if len(text) >= 4 and text[:4].isdigit():
        return int(text[:4])
    return None


def absolute_url(url: str | None, *, base: str = "https:") -> str | None:
    """Turn a relative or protocol relative URL into an absolute one.

    A path that is relative to the host of the source (``/storage/...``) is
    returned unchanged: the caller knows the base URL of the source.
    """
    if not url:
        return None
    if url.startswith("//"):
        return f"{base}{url}"
    if url.startswith(("http://", "https://")):
        return url
    return url


@dataclass(frozen=True, slots=True)
class RawMetadata:
    """Provider agnostic metadata extracted from a source payload."""

    title: str
    thumbnail: str | None = None
    description: str | None = None
    original_title: str | None = None
    alternative_title: str | None = None
    alternative_titles: tuple[str, ...] = ()
    poster_url: str | None = None
    year: int | None = None
    genres: tuple[str, ...] = ()
    total_episodes: int | None = None
    release_status: ReleaseStatus = ReleaseStatus.UNKNOWN
    dubbing_teams: tuple[str, ...] = ()
    release_type: str | None = None


@dataclass(slots=True)
class LoadedAnime:
    """A catalog entry loaded from a provider."""

    external_id: str
    metadata: RawMetadata
    anime: Any = field(default=None, repr=False)
    episode_objects: list[Any] = field(default_factory=list, repr=False)


class AnicliSourceAdapter(ABC):
    """Adapter for a single ``anicli-api`` source module."""

    id: str = ""
    display_name: str = ""
    module: str = ""
    notes: str = ""
    supports_search: bool = True
    supports_episodes: bool = True
    supports_playback: bool = True

    # -- helpers ---------------------------------------------------------

    def _module(self) -> Any:
        """Import and return the ``anicli-api`` source module."""
        try:
            return importlib.import_module(self.module)
        except ImportError as exc:  # pragma: no cover - depends on the library
            raise ProviderUnavailableError(
                f"source module {self.module!r} is not available"
            ) from exc

    def _extractor_class(self) -> Any:
        """Return the ``Extractor`` class of the source module."""
        module = self._module()
        extractor = getattr(module, "Extractor", None)
        if extractor is None:
            raise ProviderUnavailableError(f"source module {self.module!r} has no Extractor")
        return extractor

    def _anime_class(self) -> Any:
        """Return the concrete ``Anime`` class of the source module."""
        module = self._module()
        anime = getattr(module, "Anime", None)
        if anime is None:
            raise ProviderUnavailableError(f"source module {self.module!r} has no Anime model")
        return anime

    # -- interface -------------------------------------------------------

    @abstractmethod
    def external_id(self, search_result: Any) -> str:
        """Return the provider scoped identifier of a search result."""
        ...

    @abstractmethod
    def metadata(self, search_result: Any) -> RawMetadata:
        """Return the metadata of a search result."""
        ...

    @abstractmethod
    async def load(
        self,
        client: Any,
        external_id: str,
        *,
        title_hint: str | None = None,
    ) -> LoadedAnime | None:
        """Load a catalog entry by its provider scoped identifier."""
        ...

    def episode_external_id(self, episode: Any) -> str:
        """Return the provider scoped identifier of an episode."""
        ordinal = getattr(episode, "ordinal", None)
        return str(ordinal) if ordinal is not None else str(id(episode))

    def episode_title(self, episode: Any) -> str | None:
        """Return the human readable title of an episode."""
        title = getattr(episode, "title", None)
        if isinstance(title, str) and title.strip():
            return title.strip()
        return None

    def official_url(self, external_id: str, *, title_hint: str | None = None) -> str | None:
        """Return a link to the public page of a title."""
        return None

    def episode_source_title(self, source: Any) -> str:
        """Return the human readable name of a playback source."""
        title = getattr(source, "title", None)
        if isinstance(title, str) and title.strip():
            return title.strip()
        return "Source"


class AniLibertyAdapter(AnicliSourceAdapter):
    """AniLiberty (``anilibria``) - official Russian anime distributor."""

    id = "aniliberty"
    display_name = "AniLiberty"
    module = "anicli_api.source.anilibria"
    notes = "Official distributor API (aniliberty.top/api/v1). Region independent."

    BASE_URL = "https://aniliberty.top"

    def external_id(self, search_result: Any) -> str:
        """Return the release identifier."""
        data = getattr(search_result, "data", None) or {}
        release_id = data.get("id") if isinstance(data, dict) else None
        return str(release_id if release_id is not None else "")

    def metadata(self, search_result: Any) -> RawMetadata:
        """Return the metadata of a release."""
        data = getattr(search_result, "data", None) or {}
        name = dig(data, "name", default={}) or {}
        poster = dig(data, "poster", default={}) or {}
        genres = tuple(
            genre["name"]
            for genre in (data.get("genres") or [])
            if isinstance(genre, dict) and genre.get("name")
        )
        poster_url = absolute_url(poster.get("thumbnail") or poster.get("preview"))
        if poster_url:
            poster_url = (
                f"{self.BASE_URL}{poster_url}" if poster_url.startswith("/") else poster_url
            )
        is_ongoing = data.get("is_ongoing")
        status = ReleaseStatus.UNKNOWN
        if isinstance(is_ongoing, bool):
            status = ReleaseStatus.ONGOING if is_ongoing else ReleaseStatus.COMPLETED
        english = name.get("english")
        alternative = name.get("alternative")
        return RawMetadata(
            title=str(name.get("main") or getattr(search_result, "title", "") or "").strip(),
            thumbnail=getattr(search_result, "thumbnail", None),
            description=data.get("description") or None,
            original_title=english or None,
            alternative_title=alternative or None,
            alternative_titles=tuple(item for item in (english, alternative) if item),
            poster_url=poster_url,
            year=as_int(data.get("year")),
            genres=genres,
            total_episodes=as_int(data.get("episodes_total")),
            release_status=status,
            release_type=dig(data, "type", "value"),
        )

    async def load(
        self,
        client: Any,
        external_id: str,
        *,
        title_hint: str | None = None,
    ) -> LoadedAnime | None:
        """Load a release by its identifier."""
        from anicli_api.source.parsers.aniliberty_parser import AnilibertyApi  # noqa: PLC0415

        release_id = as_int(external_id)
        if release_id is None:
            return None
        result = await AnilibertyApi.async_get_release(client, id=release_id)
        if not result.is_ok:
            return None
        data = result.value
        name = dig(data, "name", default={}) or {}
        poster = dig(data, "poster", default={}) or {}
        poster_url = absolute_url(poster.get("thumbnail") or poster.get("preview"))
        if poster_url and poster_url.startswith("/"):
            poster_url = f"{self.BASE_URL}{poster_url}"
        anime_class = self._anime_class()
        anime = anime_class(
            title=str(name.get("main") or ""),
            thumbnail=poster.get("thumbnail"),
            description=data.get("description") or "",
            data=data,
            http_async=client,
        )
        metadata = RawMetadata(
            title=str(name.get("main") or ""),
            thumbnail=poster.get("thumbnail"),
            description=data.get("description") or None,
            original_title=name.get("english") or None,
            alternative_title=name.get("alternative") or None,
            alternative_titles=tuple(
                item for item in (name.get("english"), name.get("alternative")) if item
            ),
            poster_url=poster_url,
            year=as_int(data.get("year")),
            genres=tuple(
                genre["name"]
                for genre in (data.get("genres") or [])
                if isinstance(genre, dict) and genre.get("name")
            ),
            total_episodes=as_int(data.get("episodes_total")),
            release_status=(
                ReleaseStatus.ONGOING if data.get("is_ongoing") else ReleaseStatus.COMPLETED
            ),
            release_type=dig(data, "type", "value"),
        )
        return LoadedAnime(external_id=str(release_id), metadata=metadata, anime=anime)

    def episode_external_id(self, episode: Any) -> str:
        """Return the episode identifier."""
        data = getattr(episode, "data", None)
        if isinstance(data, dict) and data.get("id") is not None:
            return str(data["id"])
        return str(getattr(episode, "ordinal", "0"))

    def episode_title(self, episode: Any) -> str | None:
        """Return the episode name."""
        data = getattr(episode, "data", None)
        if isinstance(data, dict):
            name = data.get("name")
            if isinstance(name, str) and name.strip():
                return name.strip()
        return super().episode_title(episode)

    def official_url(self, external_id: str, *, title_hint: str | None = None) -> str | None:
        """Return the public page of the release."""
        return f"{self.BASE_URL}/releases/{external_id}"


class YummyAnimeAdapter(AnicliSourceAdapter):
    """Yummy Anime - catalogue with many dubbing studios."""

    id = "yummy_anime"
    display_name = "Yummy Anime"
    module = "anicli_api.source.yummy_anime"
    notes = "Aggregator; most players are region restricted to CIS/Baltics."

    BASE_URL = "https://site.yummyani.me"

    def external_id(self, search_result: Any) -> str:
        """Return the anime identifier."""
        data = getattr(search_result, "data", None) or {}
        anime_id = data.get("anime_id") if isinstance(data, dict) else None
        return str(anime_id if anime_id is not None else "")

    def metadata(self, search_result: Any) -> RawMetadata:
        """Return the metadata of an anime."""
        data = getattr(search_result, "data", None) or {}
        poster = dig(data, "poster", default={}) or {}
        genres = tuple(
            str(genre.get("title") or genre.get("name"))
            for genre in (data.get("genres") or [])
            if isinstance(genre, dict) and (genre.get("title") or genre.get("name"))
        )
        poster_url = absolute_url(poster.get("medium") or poster.get("original"))
        status = ReleaseStatus.UNKNOWN
        status_label = dig(data, "anime_status", "title")
        if isinstance(status_label, str):
            lowered = status_label.lower()
            if "выход" in lowered or "идёт" in lowered or "снима" in lowered:
                status = ReleaseStatus.ONGOING
            elif "вышел" in lowered or "заверш" in lowered:
                status = ReleaseStatus.COMPLETED
            elif "анонс" in lowered or "скоро" in lowered:
                status = ReleaseStatus.UPCOMING
        return RawMetadata(
            title=str(data.get("title") or getattr(search_result, "title", "") or "").strip(),
            thumbnail=getattr(search_result, "thumbnail", None),
            description=data.get("description") or None,
            poster_url=poster_url,
            year=as_int(data.get("year")),
            genres=genres,
            release_status=status,
            release_type=dig(data, "type", "name"),
        )

    async def load(
        self,
        client: Any,
        external_id: str,
        *,
        title_hint: str | None = None,
    ) -> LoadedAnime | None:
        """Load an anime by its identifier."""
        from anicli_api.source.parsers.yummy_anime_me_parser import YummyAnimeApi  # noqa: PLC0415

        anime_id = as_int(external_id)
        if anime_id is None:
            return None
        result = await YummyAnimeApi.async_anime_by_ids(client, ids=[anime_id])
        if not result.is_ok:
            return None
        payload = result.value
        entries = payload.get("response") or []
        if not entries:
            return None
        data = entries[0]
        poster = dig(data, "poster", default={}) or {}
        poster_url = absolute_url(poster.get("medium") or poster.get("original"))
        genres = tuple(
            str(genre.get("title") or genre.get("name"))
            for genre in (data.get("genres") or [])
            if isinstance(genre, dict) and (genre.get("title") or genre.get("name"))
        )
        status = ReleaseStatus.UNKNOWN
        status_label = dig(data, "anime_status", "title")
        if isinstance(status_label, str):
            lowered = status_label.lower()
            if "выход" in lowered or "идёт" in lowered or "снима" in lowered:
                status = ReleaseStatus.ONGOING
            elif "вышел" in lowered or "заверш" in lowered:
                status = ReleaseStatus.COMPLETED
            elif "анонс" in lowered or "скоро" in lowered:
                status = ReleaseStatus.UPCOMING
        anime_class = self._anime_class()
        anime = anime_class(
            title=str(data.get("title") or ""),
            thumbnail=poster.get("medium"),
            description=data.get("description") or "",
            data=data,
            http_async=client,
        )
        metadata = RawMetadata(
            title=str(data.get("title") or ""),
            thumbnail=poster.get("medium"),
            description=data.get("description") or None,
            poster_url=poster_url,
            year=as_int(data.get("year")),
            genres=genres,
            release_status=status,
            release_type=dig(data, "type", "name"),
        )
        return LoadedAnime(external_id=str(anime_id), metadata=metadata, anime=anime)

    def episode_title(self, episode: Any) -> str | None:
        """Return a generated episode title."""
        ordinal = getattr(episode, "ordinal", None)
        if ordinal is None:
            return super().episode_title(episode)
        return f"Эпизод {ordinal}"

    def episode_source_title(self, source: Any) -> str:
        """Return the dubbing name of the source."""
        title = getattr(source, "title", None)
        if isinstance(title, str) and title.strip():
            return title.strip()
        return "Источник"

    def official_url(self, external_id: str, *, title_hint: str | None = None) -> str | None:
        """Return the public catalogue page of the anime."""
        return f"{self.BASE_URL}/catalog/item/{external_id}"


class AnimeVostAdapter(AnicliSourceAdapter):
    """Animevost - catalogue with a small, region independent player."""

    id = "animevost"
    display_name = "Animevost"
    module = "anicli_api.source.animevost"
    notes = "Public catalogue API; the player streams MP4 directly."

    BASE_URL = "https://animevost.org"

    def external_id(self, search_result: Any) -> str:
        """Return the anime identifier."""
        data = getattr(search_result, "data", None) or {}
        anime_id = data.get("id") if isinstance(data, dict) else None
        return str(anime_id if anime_id is not None else "")

    def metadata(self, search_result: Any) -> RawMetadata:
        """Return the metadata of an anime."""
        data = getattr(search_result, "data", None) or {}
        raw_genres = data.get("genre")
        genres: tuple[str, ...] = ()
        if isinstance(raw_genres, str):
            genres = tuple(item.strip() for item in raw_genres.split(",") if item.strip())
        elif isinstance(raw_genres, list):
            genres = tuple(str(item).strip() for item in raw_genres if str(item).strip())
        return RawMetadata(
            title=str(data.get("title") or getattr(search_result, "title", "") or "").strip(),
            thumbnail=getattr(search_result, "thumbnail", None),
            description=data.get("description") or None,
            poster_url=absolute_url(data.get("urlImagePreview")),
            year=parse_year(data.get("year")),
            genres=genres,
            total_episodes=as_int(data.get("series")),
            release_type=data.get("type") if isinstance(data.get("type"), str) else None,
        )

    async def load(
        self,
        client: Any,
        external_id: str,
        *,
        title_hint: str | None = None,
    ) -> LoadedAnime | None:
        """Load an anime by searching for it - the API has no by-id endpoint."""
        extractor = self._extractor_class()(http_async_client=client)
        query = title_hint or ""
        if not query:
            return None
        results = await extractor.a_search(query)
        for result in results:
            if self.external_id(result) != external_id:
                continue
            anime = await result.a_get_anime()
            metadata = self.metadata(result)
            return LoadedAnime(external_id=external_id, metadata=metadata, anime=anime)
        return None

    def official_url(self, external_id: str, *, title_hint: str | None = None) -> str | None:
        """Return the public site of the catalogue."""
        return f"{self.BASE_URL}/"


class AnimeGoAdapter(AnicliSourceAdapter):
    """Animego - catalogue with regional restrictions."""

    id = "animego"
    display_name = "Animego"
    module = "anicli_api.source.animego"
    notes = "Region restricted to CIS and the Baltics; players are regional too."

    BASE_URL = "https://animego.me"

    def external_id(self, search_result: Any) -> str:
        """Return the relative URL of the anime page."""
        url = getattr(search_result, "url", None)
        if isinstance(url, str) and url:
            return url
        data = getattr(search_result, "data", None)
        if isinstance(data, dict) and data.get("id") is not None:
            return str(data["id"])
        return ""

    def metadata(self, search_result: Any) -> RawMetadata:
        """Return the metadata of an anime."""
        return RawMetadata(
            title=str(getattr(search_result, "title", "") or "").strip(),
            thumbnail=getattr(search_result, "thumbnail", None),
            description=getattr(search_result, "description", None) or None,
            poster_url=absolute_url(getattr(search_result, "thumbnail", None)),
        )

    async def load(
        self,
        client: Any,
        external_id: str,
        *,
        title_hint: str | None = None,
    ) -> LoadedAnime | None:
        """Load an anime from its relative page URL."""
        if not external_id:
            return None
        module = self._module()
        search_class = module.Search
        search = search_class(
            title=title_hint or "",
            thumbnail="",
            url=external_id,
            http_async=client,
        )
        anime = await search.a_get_anime()
        metadata = RawMetadata(
            title=str(getattr(anime, "title", "") or "").strip(),
            thumbnail=getattr(anime, "thumbnail", None),
            description=getattr(anime, "description", None) or None,
            poster_url=absolute_url(getattr(anime, "thumbnail", None)),
        )
        return LoadedAnime(external_id=external_id, metadata=metadata, anime=anime)

    def episode_external_id(self, episode: Any) -> str:
        """Return the episode identifier."""
        episode_id = getattr(episode, "id", None)
        if episode_id:
            return str(episode_id)
        return super().episode_external_id(episode)

    def official_url(self, external_id: str, *, title_hint: str | None = None) -> str | None:
        """Return the public page of the anime."""
        if external_id.startswith("http"):
            return external_id
        return f"{self.BASE_URL}{external_id}"


class AnimelibAdapter(AnicliSourceAdapter):
    """Animelib - catalogue with detailed metadata."""

    id = "animelib"
    display_name = "Animelib"
    module = "anicli_api.source.anilibme"
    notes = "Detailed metadata; aggressive anti-bot protection on the public API."

    BASE_URL = "https://animelib.org"

    def external_id(self, search_result: Any) -> str:
        """Return the slug of the anime."""
        data = getattr(search_result, "data", None) or {}
        slug = data.get("slug_url") if isinstance(data, dict) else None
        return str(slug if slug is not None else "")

    def metadata(self, search_result: Any) -> RawMetadata:
        """Return the metadata of an anime."""
        data = getattr(search_result, "data", None) or {}
        cover = dig(data, "cover", default={}) or {}
        genres = tuple(
            str(genre.get("name"))
            for genre in (data.get("genres") or [])
            if isinstance(genre, dict) and genre.get("name")
        )
        teams = tuple(
            str(team.get("name"))
            for team in (data.get("teams") or [])
            if isinstance(team, dict) and team.get("name")
        )
        status = ReleaseStatus.UNKNOWN
        status_label = dig(data, "status", "label")
        if isinstance(status_label, str):
            lowered = status_label.lower()
            if "снимается" in lowered or "выходит" in lowered or "онлайн" in lowered:
                status = ReleaseStatus.ONGOING
            elif "вышел" in lowered or "заверш" in lowered:
                status = ReleaseStatus.COMPLETED
            elif "анонс" in lowered:
                status = ReleaseStatus.UPCOMING
        return RawMetadata(
            title=str(
                data.get("rus_name")
                or data.get("name")
                or getattr(search_result, "title", "")
                or ""
            ).strip(),
            thumbnail=getattr(search_result, "thumbnail", None),
            description=data.get("summary") or None,
            original_title=data.get("name") or None,
            alternative_title=data.get("eng_name") or None,
            alternative_titles=tuple(
                item for item in (data.get("eng_name"), *(data.get("other_names") or [])) if item
            ),
            poster_url=absolute_url(cover.get("default")),
            year=parse_year(data.get("release_date")),
            genres=genres,
            release_status=status,
            dubbing_teams=teams,
            release_type=dig(data, "anime_type", "label"),
        )

    async def load(
        self,
        client: Any,
        external_id: str,
        *,
        title_hint: str | None = None,
    ) -> LoadedAnime | None:
        """Load an anime by its slug."""
        from anicli_api.source.parsers.animelib_org_parser import AnimelibOrgApi  # noqa: PLC0415

        result = await AnimelibOrgApi.async_get_anime(client, slug_url=external_id)
        if not result.is_ok:
            return None
        data = result.value
        cover = dig(data, "cover", default={}) or {}
        anime_class = self._anime_class()
        anime = anime_class(
            title=str(data.get("rus_name") or data.get("name") or ""),
            thumbnail=cover.get("default"),
            description=data.get("summary") or "",
            data=data,
            http_async=client,
        )
        metadata = self.metadata(
            type("Search", (), {"data": data, "title": data.get("name", "")})(),
        )
        return LoadedAnime(external_id=external_id, metadata=metadata, anime=anime)

    def episode_external_id(self, episode: Any) -> str:
        """Return the episode identifier."""
        data = getattr(episode, "data", None)
        if isinstance(data, dict) and data.get("id") is not None:
            return str(data["id"])
        return super().episode_external_id(episode)

    def official_url(self, external_id: str, *, title_hint: str | None = None) -> str | None:
        """Return the public page of the anime."""
        return f"{self.BASE_URL}/anime/{external_id}.html"


def build_adapters() -> list[AnicliSourceAdapter]:
    """Return every known source adapter."""
    return [
        AniLibertyAdapter(),
        YummyAnimeAdapter(),
        AnimeVostAdapter(),
        AnimeGoAdapter(),
        AnimelibAdapter(),
    ]
