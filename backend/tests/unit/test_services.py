"""Unit tests of the application services."""

from __future__ import annotations

import uuid

import pytest

from anime_app.application.anime.service import AnimeService
from anime_app.application.auth.service import AuthService
from anime_app.application.library.service import LibraryService
from anime_app.application.playback.service import PlaybackService
from anime_app.core.exceptions import (
    AuthenticationError,
    NotFoundError,
    ValidationError,
)
from anime_app.core.pagination import PageParams
from anime_app.domain.anime.models import AnimeDetails, AnimeGenre, AnimeSummary, ReleaseStatus
from anime_app.domain.episode.models import (
    AnimeEpisode,
    EpisodeSource,
    PlaybackKind,
    PlaybackOption,
    encode_episode_id,
)
from anime_app.domain.library.models import LibraryStatus
from anime_app.domain.providers.base import ProviderInfo, ProviderKind
from anime_app.domain.providers.registry import ProviderRegistry
from anime_app.domain.user.models import AuthenticatedIdentity
from tests.conftest import MemoryCache
from tests.fixtures.fakes import (
    FakeAnimeRepository,
    FakeCatalogProvider,
    FakeLibraryRepository,
    FakePlaybackProvider,
    FakeUserRepository,
    RecordingAuthProvider,
    provider_error,
)


@pytest.fixture
def anime_repository() -> FakeAnimeRepository:
    """Return an in-memory catalogue."""
    return FakeAnimeRepository()


@pytest.fixture
def cache() -> MemoryCache:
    """Return an in-memory cache."""
    return MemoryCache()


# -- authentication ----------------------------------------------------------


async def test_auth_service_creates_the_user() -> None:
    """The first request creates the user."""
    users = FakeUserRepository()
    provider = RecordingAuthProvider(AuthenticatedIdentity(telegram_id=55, username="ivan"))
    service = AuthService(users, [provider])

    user = await service.authenticate("test credential")

    assert user.telegram_id == 55
    assert user.username == "ivan"
    assert provider.credentials == ["credential"]
    assert users.touched == [user.id]


async def test_auth_service_rejects_a_missing_header() -> None:
    """A request without an Authorization header is rejected."""
    service = AuthService(FakeUserRepository(), [RecordingAuthProvider()])

    with pytest.raises(AuthenticationError):
        await service.authenticate(None)


async def test_auth_service_rejects_an_unknown_scheme() -> None:
    """An unknown authorization scheme is rejected."""
    service = AuthService(FakeUserRepository(), [RecordingAuthProvider()])

    with pytest.raises(AuthenticationError, match="unsupported authorization scheme"):
        await service.authenticate("basic dXNlcjpwYXNz")


async def test_auth_service_reuses_the_same_user() -> None:
    """The second request resolves the same user."""
    users = FakeUserRepository()
    provider = RecordingAuthProvider(AuthenticatedIdentity(telegram_id=55))
    service = AuthService(users, [provider])

    first = await service.authenticate("test credential")
    second = await service.authenticate("test credential")

    assert first.id == second.id


# -- search ------------------------------------------------------------------


def make_summary(
    title: str, provider: str = "fake", external_id: str | None = None
) -> AnimeSummary:
    """Build a search result."""
    return AnimeSummary(
        provider=provider,
        external_id=external_id or title.lower(),
        title=title,
        poster_url="https://example.org/poster.jpg",
        genres=[AnimeGenre(name="Action")],
        release_status=ReleaseStatus.ONGOING,
    )


async def test_search_merges_the_results_of_every_provider(
    anime_repository: FakeAnimeRepository,
    cache: MemoryCache,
) -> None:
    """The results of every provider are merged."""
    registry = ProviderRegistry(["*"])
    first = FakeCatalogProvider([make_summary("Alpha", "one", "1")])
    second = FakeCatalogProvider([make_summary("Beta", "two", "2")])
    registry.register(ProviderInfo(id="one", name="One"), catalog=first)
    registry.register(ProviderInfo(id="two", name="Two"), catalog=second)

    service = AnimeService(registry, anime_repository, cache)
    page = await service.search("alpha", PageParams(page=1, page_size=20))

    assert [item.title for item in page.items] == ["Alpha", "Beta"]
    assert page.total is None


async def test_search_removes_the_duplicates(
    anime_repository: FakeAnimeRepository,
    cache: MemoryCache,
) -> None:
    """The same title is only returned once."""
    registry = ProviderRegistry(["*"])
    first = FakeCatalogProvider([make_summary("Alpha", "one", "1")])
    second = FakeCatalogProvider([make_summary("alpha", "two", "2")])
    registry.register(ProviderInfo(id="one", name="One"), catalog=first)
    registry.register(ProviderInfo(id="two", name="Two"), catalog=second)

    service = AnimeService(registry, anime_repository, cache)
    page = await service.search("alpha", PageParams(page=1, page_size=20))

    assert len(page.items) == 1


async def test_a_failing_provider_does_not_break_the_search(
    anime_repository: FakeAnimeRepository,
    cache: MemoryCache,
) -> None:
    """A broken provider is skipped instead of failing the request."""
    registry = ProviderRegistry(["*"])
    broken = FakeCatalogProvider(error=provider_error())
    working = FakeCatalogProvider([make_summary("Alpha", "one", "1")])
    registry.register(ProviderInfo(id="broken", name="Broken"), catalog=broken)
    registry.register(ProviderInfo(id="one", name="One"), catalog=working)

    service = AnimeService(registry, anime_repository, cache)
    page = await service.search("alpha", PageParams(page=1, page_size=20))

    assert [item.title for item in page.items] == ["Alpha"]


async def test_search_persists_the_results(
    anime_repository: FakeAnimeRepository,
    cache: MemoryCache,
) -> None:
    """The search results are added to the local catalogue."""
    registry = ProviderRegistry(["*"])
    provider = FakeCatalogProvider([make_summary("Alpha", "one", "1")])
    registry.register(ProviderInfo(id="one", name="One"), catalog=provider)

    service = AnimeService(registry, anime_repository, cache)
    page = await service.search("alpha", PageParams(page=1, page_size=20))

    assert page.items[0].anime_id is not None
    assert len(anime_repository.records) == 1


async def test_search_uses_the_cache(
    anime_repository: FakeAnimeRepository,
    cache: MemoryCache,
) -> None:
    """A repeated search is served from the cache."""
    registry = ProviderRegistry(["*"])
    provider = FakeCatalogProvider([make_summary("Alpha", "one", "1")])
    registry.register(ProviderInfo(id="one", name="One"), catalog=provider)

    service = AnimeService(registry, anime_repository, cache)
    await service.search("alpha", PageParams(page=1, page_size=20))
    await service.search("alpha", PageParams(page=1, page_size=20))

    assert len(provider.search_calls) == 1


async def test_search_paginates(
    anime_repository: FakeAnimeRepository,
    cache: MemoryCache,
) -> None:
    """The second page does not repeat the first one."""
    registry = ProviderRegistry(["*"])
    provider = FakeCatalogProvider(
        [make_summary(f"Title {index}", "one", str(index)) for index in range(5)]
    )
    registry.register(ProviderInfo(id="one", name="One"), catalog=provider)

    service = AnimeService(registry, anime_repository, cache)
    first = await service.search("title", PageParams(page=1, page_size=2))
    second = await service.search("title", PageParams(page=2, page_size=2))

    assert [item.title for item in first.items] == ["Title 0", "Title 1"]
    assert [item.title for item in second.items] == ["Title 2", "Title 3"]


@pytest.mark.parametrize("query", ["", "a"])
async def test_search_rejects_short_queries(
    anime_repository: FakeAnimeRepository,
    cache: MemoryCache,
    query: str,
) -> None:
    """A too short query is rejected."""
    service = AnimeService(ProviderRegistry(["*"]), anime_repository, cache)

    with pytest.raises(ValidationError):
        await service.search(query, PageParams())


async def test_search_rejects_long_queries(
    anime_repository: FakeAnimeRepository,
    cache: MemoryCache,
) -> None:
    """A too long query is rejected."""
    service = AnimeService(ProviderRegistry(["*"]), anime_repository, cache)

    with pytest.raises(ValidationError):
        await service.search("x" * 200, PageParams())


async def test_search_without_providers_returns_an_empty_page(
    anime_repository: FakeAnimeRepository,
    cache: MemoryCache,
) -> None:
    """Without an enabled provider the search returns nothing."""
    service = AnimeService(ProviderRegistry([]), anime_repository, cache)

    page = await service.search("alpha", PageParams())

    assert page.items == []


# -- details -----------------------------------------------------------------


async def test_details_are_loaded_from_the_provider(
    anime_repository: FakeAnimeRepository,
    cache: MemoryCache,
) -> None:
    """The details are loaded from the provider."""
    record = await anime_repository.get_or_create(
        provider="one",
        external_id="1",
        canonical_title="Alpha",
        title_key="alpha",
    )
    details = AnimeDetails(
        provider="one",
        external_id="1",
        title="Alpha",
        description="Description",
        genres=[AnimeGenre(name="Action")],
    )
    registry = ProviderRegistry(["*"])
    registry.register(
        ProviderInfo(id="one", name="One"), catalog=FakeCatalogProvider(details=details)
    )

    service = AnimeService(registry, anime_repository, cache)
    result = await service.get_details(record.id)

    assert result.description == "Description"
    assert result.anime_id == record.id
    assert result.available_providers == ["one"]


async def test_details_fall_back_to_the_local_catalogue(
    anime_repository: FakeAnimeRepository,
    cache: MemoryCache,
) -> None:
    """A broken provider still returns a usable card."""
    record = await anime_repository.get_or_create(
        provider="one",
        external_id="1",
        canonical_title="Alpha",
        title_key="alpha",
        poster_url="https://example.org/poster.jpg",
    )
    registry = ProviderRegistry(["*"])
    registry.register(
        ProviderInfo(id="one", name="One"),
        catalog=FakeCatalogProvider(error=provider_error()),
    )

    service = AnimeService(registry, anime_repository, cache)
    result = await service.get_details(record.id)

    assert result.title == "Alpha"
    assert result.poster_url == "https://example.org/poster.jpg"


async def test_details_of_an_unknown_anime_raise(
    anime_repository: FakeAnimeRepository,
    cache: MemoryCache,
) -> None:
    """An unknown catalogue entry is reported as not found."""
    service = AnimeService(ProviderRegistry(["*"]), anime_repository, cache)

    with pytest.raises(NotFoundError):
        await service.get_details(uuid.uuid4())


async def test_the_available_providers_are_reported(
    anime_repository: FakeAnimeRepository,
    cache: MemoryCache,
) -> None:
    """The providers offering the same title are reported."""
    first = await anime_repository.get_or_create(
        provider="one",
        external_id="1",
        canonical_title="Alpha",
        title_key="alpha",
    )
    await anime_repository.get_or_create(
        provider="two",
        external_id="2",
        canonical_title="Alpha",
        title_key="alpha",
    )
    details = AnimeDetails(provider="one", external_id="1", title="Alpha")
    registry = ProviderRegistry(["*"])
    registry.register(
        ProviderInfo(id="one", name="One"), catalog=FakeCatalogProvider(details=details)
    )

    service = AnimeService(registry, anime_repository, cache)
    result = await service.get_details(first.id)

    assert result.available_providers == ["one", "two"]


# -- episodes ----------------------------------------------------------------


async def test_episodes_are_mapped_with_the_opaque_id(
    anime_repository: FakeAnimeRepository,
    cache: MemoryCache,
) -> None:
    """Every episode carries the identifier used by the API."""
    record = await anime_repository.get_or_create(
        provider="one",
        external_id="1",
        canonical_title="Alpha",
        title_key="alpha",
    )
    episodes = [
        AnimeEpisode(
            provider="one", anime_external_id="1", external_id="ep-1", number=1, title="First"
        )
    ]
    registry = ProviderRegistry(["*"])
    registry.register(
        ProviderInfo(id="one", name="One"),
        catalog=FakeCatalogProvider(episodes=episodes),
    )

    service = AnimeService(registry, anime_repository, cache)
    page = await service.get_episodes(record.id, PageParams())

    assert page.items[0].id
    assert page.total == 1


# -- playback ----------------------------------------------------------------


async def test_sources_are_resolved(
    anime_repository: FakeAnimeRepository,
    cache: MemoryCache,
) -> None:
    """The sources of an episode are returned."""
    provider = FakePlaybackProvider(
        sources=[EpisodeSource(provider="one", key="abc", title="Dub", player="kodik")]
    )
    registry = ProviderRegistry(["*"])
    registry.register(
        ProviderInfo(id="one", name="One", kind=ProviderKind.PLAYBACK), playback=provider
    )

    service = PlaybackService(registry, anime_repository)
    sources = await service.get_sources(encode_episode_id("one", "1", "ep-1"))

    assert sources[0].title == "Dub"


async def test_playback_options_are_resolved(
    anime_repository: FakeAnimeRepository,
    cache: MemoryCache,
) -> None:
    """The playable streams of a source are returned."""
    provider = FakePlaybackProvider(
        options=[
            PlaybackOption(
                provider="one",
                source_key="abc",
                source_title="Dub",
                kind=PlaybackKind.HLS,
                quality=720,
                url="https://example.org/master.m3u8",
            )
        ]
    )
    registry = ProviderRegistry(["*"])
    registry.register(
        ProviderInfo(id="one", name="One", kind=ProviderKind.PLAYBACK), playback=provider
    )

    service = PlaybackService(registry, anime_repository)
    options = await service.get_playback_options(encode_episode_id("one", "1", "ep-1"), "abc")

    assert options[0].kind == PlaybackKind.HLS


async def test_a_malformed_episode_id_is_rejected(
    anime_repository: FakeAnimeRepository,
) -> None:
    """A malformed episode identifier is rejected."""
    service = PlaybackService(ProviderRegistry(["*"]), anime_repository)

    with pytest.raises(ValidationError):
        await service.get_sources("not-an-episode-id")


# -- library -----------------------------------------------------------------


@pytest.fixture
def library_repository() -> FakeLibraryRepository:
    """Return an in-memory library."""
    return FakeLibraryRepository()


async def test_an_anime_is_added_to_the_library(
    anime_repository: FakeAnimeRepository,
    library_repository: FakeLibraryRepository,
) -> None:
    """An anime can be added to the library."""
    record = await anime_repository.get_or_create(
        provider="one",
        external_id="1",
        canonical_title="Alpha",
        title_key="alpha",
        poster_url="https://example.org/poster.jpg",
    )
    service = LibraryService(library_repository, anime_repository)
    user_id = uuid.uuid4()

    item = await service.add(user_id, record.id, status=LibraryStatus.WATCHING)

    assert item.status == LibraryStatus.WATCHING
    assert item.anime is not None
    assert item.anime.title == "Alpha"


async def test_adding_an_unknown_anime_is_rejected(
    anime_repository: FakeAnimeRepository,
    library_repository: FakeLibraryRepository,
) -> None:
    """An unknown catalogue entry cannot be added."""
    service = LibraryService(library_repository, anime_repository)

    with pytest.raises(NotFoundError):
        await service.add(uuid.uuid4(), uuid.uuid4())


async def test_the_status_and_the_progress_are_updated(
    anime_repository: FakeAnimeRepository,
    library_repository: FakeLibraryRepository,
) -> None:
    """The status and the progress of an entry can be updated."""
    record = await anime_repository.get_or_create(
        provider="one",
        external_id="1",
        canonical_title="Alpha",
        title_key="alpha",
    )
    service = LibraryService(library_repository, anime_repository)
    user_id = uuid.uuid4()
    await service.add(user_id, record.id)

    item = await service.update(
        user_id, record.id, status=LibraryStatus.COMPLETED, progress_episode=12
    )

    assert item.status == LibraryStatus.COMPLETED
    assert item.progress_episode == 12


async def test_updating_a_missing_entry_is_rejected(
    anime_repository: FakeAnimeRepository,
    library_repository: FakeLibraryRepository,
) -> None:
    """A missing entry cannot be updated."""
    service = LibraryService(library_repository, anime_repository)

    with pytest.raises(NotFoundError):
        await service.update(uuid.uuid4(), uuid.uuid4(), status=LibraryStatus.COMPLETED)


async def test_a_negative_progress_is_rejected(
    anime_repository: FakeAnimeRepository,
    library_repository: FakeLibraryRepository,
) -> None:
    """A negative progress is rejected."""
    record = await anime_repository.get_or_create(
        provider="one",
        external_id="1",
        canonical_title="Alpha",
        title_key="alpha",
    )
    service = LibraryService(library_repository, anime_repository)

    with pytest.raises(ValidationError):
        await service.add(uuid.uuid4(), record.id, progress_episode=-1)


async def test_entries_can_be_filtered_by_status(
    anime_repository: FakeAnimeRepository,
    library_repository: FakeLibraryRepository,
) -> None:
    """The library can be filtered by status."""
    service = LibraryService(library_repository, anime_repository)
    user_id = uuid.uuid4()
    first = await anime_repository.get_or_create(
        provider="one",
        external_id="1",
        canonical_title="Alpha",
        title_key="alpha",
    )
    second = await anime_repository.get_or_create(
        provider="one",
        external_id="2",
        canonical_title="Beta",
        title_key="beta",
    )
    await service.add(user_id, first.id, status=LibraryStatus.WATCHING)
    await service.add(user_id, second.id, status=LibraryStatus.COMPLETED)

    page = await service.list_entries(user_id, PageParams(), status=LibraryStatus.WATCHING)

    assert page.total == 1
    assert page.items[0].anime is not None
    assert page.items[0].anime.title == "Alpha"


async def test_entries_can_be_removed(
    anime_repository: FakeAnimeRepository,
    library_repository: FakeLibraryRepository,
) -> None:
    """An entry can be removed from the library."""
    record = await anime_repository.get_or_create(
        provider="one",
        external_id="1",
        canonical_title="Alpha",
        title_key="alpha",
    )
    service = LibraryService(library_repository, anime_repository)
    user_id = uuid.uuid4()
    await service.add(user_id, record.id)

    await service.delete(user_id, record.id)

    page = await service.list_entries(user_id, PageParams())
    assert page.items == []
    assert page.total == 0


async def test_removing_a_missing_entry_is_rejected(
    anime_repository: FakeAnimeRepository,
    library_repository: FakeLibraryRepository,
) -> None:
    """A missing entry cannot be removed."""
    service = LibraryService(library_repository, anime_repository)

    with pytest.raises(NotFoundError):
        await service.delete(uuid.uuid4(), uuid.uuid4())


async def test_continue_watching_returns_the_started_titles(
    anime_repository: FakeAnimeRepository,
    library_repository: FakeLibraryRepository,
) -> None:
    """Only the titles with a recorded progress are returned."""
    service = LibraryService(library_repository, anime_repository)
    user_id = uuid.uuid4()
    started = await anime_repository.get_or_create(
        provider="one",
        external_id="1",
        canonical_title="Alpha",
        title_key="alpha",
    )
    planned = await anime_repository.get_or_create(
        provider="one",
        external_id="2",
        canonical_title="Beta",
        title_key="beta",
    )
    await service.add(user_id, started.id, progress_episode=3)
    await service.add(user_id, planned.id)

    items = await service.continue_watching(user_id)

    assert len(items) == 1
    assert items[0].anime is not None
    assert items[0].anime.title == "Alpha"
