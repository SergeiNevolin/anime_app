"""Contract tests of the ``anicli-api`` adapter.

The tests never touch the network: the ``anicli-api`` extractor is replaced by
a test double that returns the same object shapes as the real library.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from anime_app.core.exceptions import (
    ProviderError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)
from anime_app.domain.anime.models import ReleaseStatus
from anime_app.domain.episode.models import PlaybackKind
from anime_app.infrastructure.providers.anicli.adapter import AnicliApiProvider
from anime_app.infrastructure.providers.anicli.sources import (
    AniLibertyAdapter,
    AnimeGoAdapter,
    AnimelibAdapter,
    AnimeVostAdapter,
    RawMetadata,
    YummyAnimeAdapter,
    dig,
)
from tests.fixtures.anicli_payloads import (
    ANIBOOM_VIDEO,
    ANILIBERTY_RELEASE,
    ANIME_GO_SEARCH,
    ANIMELIB_DETAIL,
    ANIMEVOST_ITEM,
    YUMMY_ITEM,
)


class FakeVideo:
    """Mirror of ``anicli_api.player.base.Video``."""

    def __init__(self, type: str, quality: int, url: str, headers: dict[str, str] | None = None):
        self.type = type
        self.quality = quality
        self.url = url
        self.headers = headers or {}


class FakeSource:
    """Mirror of ``anicli_api.base.BaseSource``."""

    def __init__(self, title: str, url: str, videos: list[FakeVideo] | None = None) -> None:
        self.title = title
        self.url = url
        self._videos = videos or []

    async def a_get_videos(self, **kwargs: Any) -> list[FakeVideo]:
        """Return the configured videos."""
        return self._videos


class FakeEpisode:
    """Mirror of ``anicli_api.base.BaseEpisode``."""

    def __init__(self, title: str, ordinal: int, sources: list[FakeSource]) -> None:
        self.title = title
        self.ordinal = ordinal
        self._sources = sources

    async def a_get_sources(self) -> list[FakeSource]:
        """Return the configured sources."""
        return self._sources


class FakeAnime:
    """Mirror of ``anicli_api.base.BaseAnime``."""

    def __init__(self, title: str, description: str, episodes: list[FakeEpisode]) -> None:
        self.title = title
        self.description = description
        self.thumbnail = "https://example.org/poster.jpg"
        self._episodes = episodes

    async def a_get_episodes(self) -> list[FakeEpisode]:
        """Return the configured episodes."""
        return self._episodes


class FakeSearch:
    """Mirror of ``anicli_api.base.BaseSearch``."""

    def __init__(self, title: str, thumbnail: str, url: str, data: Any = None) -> None:
        self.title = title
        self.thumbnail = thumbnail
        self.url = url
        self.data = data

    async def a_get_anime(self) -> FakeAnime:
        """Return the configured anime."""
        return FakeAnime(self.title, "description", [])


class FakeExtractor:
    """Mirror of ``anicli_api.base.BaseExtractor``."""

    def __init__(
        self,
        results: list[FakeSearch] | None = None,
        *,
        error: Exception | None = None,
    ) -> None:
        self.results = results or []
        self.error = error

    async def a_search(self, query: str) -> list[FakeSearch]:
        """Return the configured results."""
        if self.error is not None:
            raise self.error
        return self.results


class StubSourceAdapter:
    """A source adapter that does not depend on the ``anicli-api`` modules."""

    id = "stub"
    display_name = "Stub"
    notes = "test double"

    def __init__(self, anime: FakeAnime | None = None, metadata: RawMetadata | None = None) -> None:
        self._anime = anime
        self._metadata = metadata or RawMetadata(title="Stub title")

    def external_id(self, search_result: Any) -> str:
        """Return the external identifier."""
        return "stub-1"

    def metadata(self, search_result: Any) -> RawMetadata:
        """Return the metadata of the search result."""
        title = getattr(search_result, "title", None)
        if title is None:
            title = self._metadata.title
        return RawMetadata(title=title, description=self._metadata.description)

    async def load(self, client: Any, external_id: str, *, title_hint: str | None = None) -> Any:
        """Return the configured anime."""
        from anime_app.infrastructure.providers.anicli.sources import LoadedAnime

        if self._anime is None:
            return None
        return LoadedAnime(external_id=external_id, metadata=self._metadata, anime=self._anime)

    def episode_external_id(self, episode: Any) -> str:
        """Return the episode identifier."""
        return str(episode.ordinal)

    def episode_title(self, episode: Any) -> str | None:
        """Return the episode title."""
        return episode.title

    def episode_source_title(self, source: Any) -> str:
        """Return the source title."""
        return source.title

    def official_url(self, external_id: str, *, title_hint: str | None = None) -> str | None:
        """Return the public page of the title."""
        return "https://example.org/anime"


@pytest.fixture
def http_client() -> httpx.AsyncClient:
    """Return an HTTP client that is never used."""
    return httpx.AsyncClient(timeout=1.0)


@pytest.fixture
def provider(http_client: httpx.AsyncClient) -> AnicliApiProvider:
    """Return a provider backed by the stub adapter."""
    return AnicliApiProvider(StubSourceAdapter(), http_client, timeout=1.0)


# -- search ------------------------------------------------------------------


async def test_search_maps_the_results(provider: AnicliApiProvider) -> None:
    """The search results are converted into the domain summary."""
    provider._extractor = FakeExtractor(
        [FakeSearch("Cowboy Bebop", "https://example.org/poster.jpg", "https://example.org/1")]
    )

    results = await provider.search("cowboy", limit=10, offset=0)

    assert len(results) == 1
    assert results[0].provider == "stub"
    assert results[0].external_id == "stub-1"
    assert results[0].title == "Cowboy Bebop"


async def test_search_returns_an_empty_list(provider: AnicliApiProvider) -> None:
    """An empty answer produces an empty result."""
    provider._extractor = FakeExtractor([])

    assert await provider.search("cowboy", limit=10, offset=0) == []


async def test_search_applies_the_pagination(provider: AnicliApiProvider) -> None:
    """The offset and the limit are applied to the results."""
    provider._extractor = FakeExtractor(
        [
            FakeSearch(f"Title {index}", "poster", f"https://example.org/{index}")
            for index in range(5)
        ]
    )

    results = await provider.search("cowboy", limit=2, offset=1)

    assert len(results) == 2


async def test_search_skips_unusable_items(provider: AnicliApiProvider) -> None:
    """An item without a title is skipped."""
    provider._extractor = FakeExtractor([FakeSearch("", "poster", "https://example.org/1")])

    assert await provider.search("cowboy", limit=10, offset=0) == []


async def test_search_normalizes_a_timeout(provider: AnicliApiProvider) -> None:
    """A timeout is reported as a provider timeout."""
    provider._extractor = FakeExtractor(error=httpx.ReadTimeout("timeout"))

    with pytest.raises(ProviderTimeoutError):
        await provider.search("cowboy", limit=10, offset=0)


async def test_search_normalizes_an_http_error(provider: AnicliApiProvider) -> None:
    """An HTTP error is reported as an unavailable provider."""
    request = httpx.Request("GET", "https://example.org")
    response = httpx.Response(503, request=request)
    provider._extractor = FakeExtractor(
        error=httpx.HTTPStatusError("boom", request=request, response=response)
    )

    with pytest.raises(ProviderUnavailableError):
        await provider.search("cowboy", limit=10, offset=0)


async def test_search_normalizes_a_client_error(provider: AnicliApiProvider) -> None:
    """A 4xx answer is reported as an unavailable provider."""
    request = httpx.Request("GET", "https://example.org")
    response = httpx.Response(404, request=request)
    provider._extractor = FakeExtractor(
        error=httpx.HTTPStatusError("boom", request=request, response=response)
    )

    with pytest.raises(ProviderUnavailableError):
        await provider.search("cowboy", limit=10, offset=0)


async def test_search_normalizes_an_unknown_error(provider: AnicliApiProvider) -> None:
    """An unexpected error is reported as a provider error."""
    provider._extractor = FakeExtractor(error=RuntimeError("boom"))

    with pytest.raises(ProviderError):
        await provider.search("cowboy", limit=10, offset=0)


# -- details and episodes ----------------------------------------------------


async def test_details_are_loaded(provider: AnicliApiProvider) -> None:
    """The details of a title are loaded through the source adapter."""
    adapter = StubSourceAdapter(
        anime=FakeAnime("Title", "Description", []),
        metadata=RawMetadata(title="Title", description="Description"),
    )
    provider._adapter = adapter

    details = await provider.get_details("stub-1")

    assert details.title == "Title"
    assert details.description == "Description"
    assert details.available_providers == ["stub"]


async def test_details_of_an_unknown_title_are_reported(provider: AnicliApiProvider) -> None:
    """A title that cannot be loaded is reported as unavailable."""
    with pytest.raises(ProviderUnavailableError):
        await provider.get_details("missing")


async def test_episodes_are_mapped(provider: AnicliApiProvider) -> None:
    """The episodes are mapped to the domain model."""
    episode = FakeEpisode("First", 1, [])
    provider._adapter = StubSourceAdapter(
        anime=FakeAnime("Title", "Description", [episode]),
    )

    episodes = await provider.get_episodes("stub-1")

    assert episodes[0].number == 1
    assert episodes[0].title == "First"
    assert episodes[0].external_id == "1"


async def test_an_unknown_episode_is_reported(provider: AnicliApiProvider) -> None:
    """An unknown episode identifier is reported as unavailable."""
    provider._adapter = StubSourceAdapter(anime=FakeAnime("Title", "Description", []))

    with pytest.raises(ProviderUnavailableError, match="not available"):
        await provider.get_sources("stub-1", "42")


# -- playback ----------------------------------------------------------------


async def test_sources_are_mapped(provider: AnicliApiProvider) -> None:
    """The sources of an episode are mapped to the domain model."""
    source = FakeSource("AniLiberty", "https://kodikplayer.com/season/1/720p")
    episode = FakeEpisode("First", 1, [source])
    provider._adapter = StubSourceAdapter(anime=FakeAnime("Title", "Description", [episode]))

    sources = await provider.get_sources("stub-1", "1")

    assert sources[0].title == "AniLiberty"
    assert sources[0].official_url == "https://example.org/anime"
    assert sources[0].player == "kodik"


async def test_playback_options_are_mapped(provider: AnicliApiProvider) -> None:
    """The playable streams are mapped and sorted by quality."""
    source = FakeSource(
        "AniLiberty",
        "https://kodikplayer.com/season/1/720p",
        [
            FakeVideo("m3u8", 480, "https://example.org/480.m3u8"),
            FakeVideo("m3u8", 1080, "https://example.org/1080.m3u8"),
            FakeVideo("mpd", 1080, "https://example.org/1080.mpd"),
        ],
    )
    episode = FakeEpisode("First", 1, [source])
    provider._adapter = StubSourceAdapter(anime=FakeAnime("Title", "Description", [episode]))
    sources = await provider.get_sources("stub-1", "1")

    options = await provider.get_playback_options("stub-1", "1", sources[0].key)

    assert [option.kind for option in options] == [
        PlaybackKind.HLS,
        PlaybackKind.DASH,
        PlaybackKind.HLS,
    ]
    assert options[0].quality == 1080


async def test_unknown_stream_types_are_skipped(provider: AnicliApiProvider) -> None:
    """A stream type that cannot be played is skipped."""
    source = FakeSource(
        "AniLiberty",
        "https://example.org/player",
        [FakeVideo("audio", 0, "https://example.org/audio.mp3")],
    )
    episode = FakeEpisode("First", 1, [source])
    provider._adapter = StubSourceAdapter(anime=FakeAnime("Title", "Description", [episode]))
    sources = await provider.get_sources("stub-1", "1")

    assert await provider.get_playback_options("stub-1", "1", sources[0].key) == []


async def test_only_safe_headers_are_forwarded(provider: AnicliApiProvider) -> None:
    """The cookies and the authorization headers are not forwarded."""
    source = FakeSource(
        "AniLiberty",
        "https://example.org/player",
        [
            FakeVideo(
                "mp4",
                720,
                "https://example.org/video.mp4",
                {
                    "User-Agent": "Mozilla/5.0",
                    "Referer": "https://example.org",
                    "Cookie": "session=secret",
                    "Authorization": "Bearer secret",
                },
            )
        ],
    )
    episode = FakeEpisode("First", 1, [source])
    provider._adapter = StubSourceAdapter(anime=FakeAnime("Title", "Description", [episode]))
    sources = await provider.get_sources("stub-1", "1")

    options = await provider.get_playback_options("stub-1", "1", sources[0].key)

    assert options[0].headers == {"User-Agent": "Mozilla/5.0", "Referer": "https://example.org"}


async def test_an_unknown_source_is_reported(provider: AnicliApiProvider) -> None:
    """An unknown source key is reported as unavailable."""
    episode = FakeEpisode("First", 1, [FakeSource("AniLiberty", "https://example.org")])
    provider._adapter = StubSourceAdapter(anime=FakeAnime("Title", "Description", [episode]))

    with pytest.raises(ProviderUnavailableError, match="not available"):
        await provider.get_playback_options("stub-1", "1", "unknown-key")


# -- per source metadata ----------------------------------------------------


def test_the_aniliberty_metadata_is_extracted() -> None:
    """The AniLiberty payload is translated into the domain metadata."""
    adapter = AniLibertyAdapter()
    search = FakeSearch(
        ANILIBERTY_RELEASE["name"]["main"],
        ANILIBERTY_RELEASE["poster"]["thumbnail"],
        "_",
        ANILIBERTY_RELEASE,
    )

    metadata = adapter.metadata(search)

    assert metadata.title == "Ковбой Бибоп"
    assert metadata.original_title == "Cowboy Bebop"
    assert metadata.year == 1998
    assert metadata.total_episodes == 26
    assert metadata.release_status == ReleaseStatus.COMPLETED
    assert metadata.genres == ("Комедия", "Приключения")
    assert metadata.poster_url is not None
    assert metadata.poster_url.startswith("https://aniliberty.top/storage/")


def test_the_yummy_anime_metadata_is_extracted() -> None:
    """The Yummy Anime payload is translated into the domain metadata."""
    adapter = YummyAnimeAdapter()
    search = FakeSearch(
        YUMMY_ITEM["title"],
        YUMMY_ITEM["poster"]["medium"],
        "https://site.yummyani.me/catalog/item/x",
        YUMMY_ITEM,
    )

    metadata = adapter.metadata(search)

    assert metadata.title == "Ковбой Бибоп"
    assert metadata.year == 1998
    assert metadata.genres == ("Приключения",)
    assert metadata.poster_url == "https://static.yani.tv/posters/full/1636669624.jpg"
    assert metadata.release_status == ReleaseStatus.COMPLETED


def test_the_animevost_metadata_is_extracted() -> None:
    """The Animevost payload is translated into the domain metadata."""
    adapter = AnimeVostAdapter()
    search = FakeSearch(
        ANIMEVOST_ITEM["title"],
        ANIMEVOST_ITEM["urlImagePreview"],
        "_",
        ANIMEVOST_ITEM,
    )

    metadata = adapter.metadata(search)

    assert metadata.title.startswith("Ковбой Бибоп")
    assert metadata.year == 1998
    assert metadata.total_episodes == 26
    assert metadata.genres == ("Приключения", "Драма")


def test_the_animelib_metadata_is_extracted() -> None:
    """The Animelib payload is translated into the domain metadata."""
    adapter = AnimelibAdapter()
    search = FakeSearch(
        ANIMELIB_DETAIL["rus_name"],
        ANIMELIB_DETAIL["cover"]["default"],
        ANIMELIB_DETAIL["slug_url"],
        ANIMELIB_DETAIL,
    )

    metadata = adapter.metadata(search)

    assert metadata.title == "Ковбой Бибоп"
    assert metadata.original_title == "Cow Bebop"
    assert metadata.year == 1998
    assert metadata.dubbing_teams == ("AniLibria",)


def test_the_animego_metadata_is_extracted() -> None:
    """The Animego payload is translated into the domain metadata."""
    adapter = AnimeGoAdapter()
    search = FakeSearch(
        ANIME_GO_SEARCH["title"], ANIME_GO_SEARCH["thumbnail"], ANIME_GO_SEARCH["url_path"]
    )

    metadata = adapter.metadata(search)

    assert metadata.title == "Ковбой Бибоп"
    assert adapter.external_id(search) == "/anime/kovboy-bibop-276"


def test_dig_returns_the_default_for_a_missing_path() -> None:
    """The safe navigation helper never raises."""
    assert dig({"a": {"b": 1}}, "a", "b") == 1
    assert dig({"a": {"b": 1}}, "a", "c") is None
    assert dig({"a": 1}, "a", "b", default="x") == "x"
    assert dig(None, "a") is None


def test_the_player_name_is_derived_from_the_url() -> None:
    """The player name is derived from the player url."""
    assert AnicliApiProvider._player_name("https://kodikplayer.com/season/1") == "kodik"
    assert AnicliApiProvider._player_name("https://aniboom.one/embed/x") == "aniboom"
    assert AnicliApiProvider._player_name("https://example.org/x") == "example.org"
    assert AnicliApiProvider._player_name(None) == "unknown"
    assert AnicliApiProvider._player_name("_") == "unknown"


def test_the_video_kind_is_mapped() -> None:
    """The stream types are mapped to the playback kinds."""
    from anime_app.infrastructure.providers.anicli.adapter import VIDEO_KIND_MAP

    assert VIDEO_KIND_MAP["m3u8"] == PlaybackKind.HLS
    assert VIDEO_KIND_MAP["mp4"] == PlaybackKind.MP4
    assert VIDEO_KIND_MAP["mpd"] == PlaybackKind.DASH
    assert "audio" not in VIDEO_KIND_MAP
