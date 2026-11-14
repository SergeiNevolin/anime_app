"""Contract tests of the per source loaders of the ``anicli-api`` adapter.

The upstream API clients are replaced by test doubles, so the tests never
touch the network while still exercising the real translation code.
"""

from __future__ import annotations

from typing import Any

import pytest

from anime_app.domain.anime.models import ReleaseStatus
from anime_app.infrastructure.providers.anicli.sources import (
    AniLibertyAdapter,
    AnimeGoAdapter,
    AnimeVostAdapter,
    AnimelibAdapter,
    YummyAnimeAdapter,
)
from tests.fixtures.anicli_payloads import (
    ANILIBERTY_RELEASE,
    ANIMEVOST_ITEM,
    ANIMELIB_DETAIL,
    YUMMY_ITEM,
)


class Result:
    """Mirror of the ``Result`` container used by the generated API clients."""

    def __init__(self, is_ok: bool, value: Any = None) -> None:
        self.is_ok = is_ok
        self.value = value


@pytest.fixture
def http_client() -> Any:
    """Return an HTTP client that is never used."""
    import httpx

    return httpx.AsyncClient(timeout=1.0)


async def test_the_aniliberty_release_is_loaded(http_client: Any, monkeypatch) -> None:
    """A release is loaded through the upstream API client."""
    from anicli_api.source.parsers import aniliberty_parser

    async def fake_get_release(client: Any, *, id: int, **kwargs: Any) -> Result:
        return Result(True, ANILIBERTY_RELEASE)

    monkeypatch.setattr(aniliberty_parser.AnilibertyApi, "async_get_release", fake_get_release)

    loaded = await AniLibertyAdapter().load(http_client, "8443")

    assert loaded is not None
    assert loaded.external_id == "8443"
    assert loaded.metadata.title == "Ковбой Бибоп"
    assert loaded.metadata.year == 1998
    assert loaded.metadata.release_status == ReleaseStatus.COMPLETED
    assert loaded.anime is not None


async def test_the_aniliberty_release_is_not_found(http_client: Any, monkeypatch) -> None:
    """A release that does not exist resolves to nothing."""
    from anicli_api.source.parsers import aniliberty_parser

    async def fake_get_release(client: Any, *, id: int, **kwargs: Any) -> Result:
        return Result(False)

    monkeypatch.setattr(aniliberty_parser.AnilibertyApi, "async_get_release", fake_get_release)

    assert await AniLibertyAdapter().load(http_client, "404") is None


async def test_the_aniliberty_release_needs_a_numeric_id(http_client: Any) -> None:
    """A non numeric release identifier is rejected."""
    assert await AniLibertyAdapter().load(http_client, "not-a-number") is None


async def test_the_yummy_anime_item_is_loaded(http_client: Any, monkeypatch) -> None:
    """An anime is loaded through the upstream API client."""
    from anicli_api.source.parsers import yummy_anime_me_parser

    async def fake_anime_by_ids(client: Any, *, ids: list[int], **kwargs: Any) -> Result:
        return Result(True, {"response": [YUMMY_ITEM]})

    monkeypatch.setattr(
        yummy_anime_me_parser.YummyAnimeApi,
        "async_anime_by_ids",
        fake_anime_by_ids,
    )

    loaded = await YummyAnimeAdapter().load(http_client, "1636669624")

    assert loaded is not None
    assert loaded.external_id == "1636669624"
    assert loaded.metadata.title == "Ковбой Бибоп"
    assert loaded.metadata.year == 1998
    assert loaded.anime is not None


async def test_the_yummy_anime_item_is_not_found(http_client: Any, monkeypatch) -> None:
    """An empty answer resolves to nothing."""
    from anicli_api.source.parsers import yummy_anime_me_parser

    async def fake_anime_by_ids(client: Any, *, ids: list[int], **kwargs: Any) -> Result:
        return Result(True, {"response": []})

    monkeypatch.setattr(
        yummy_anime_me_parser.YummyAnimeApi,
        "async_anime_by_ids",
        fake_anime_by_ids,
    )

    assert await YummyAnimeAdapter().load(http_client, "1") is None


async def test_the_yummy_anime_item_needs_a_numeric_id(http_client: Any) -> None:
    """A non numeric identifier is rejected."""
    assert await YummyAnimeAdapter().load(http_client, "abc") is None


async def test_the_animelib_anime_is_loaded(http_client: Any, monkeypatch) -> None:
    """An anime is loaded through the upstream API client."""
    from anicli_api.source.parsers import animelib_org_parser

    async def fake_get_anime(client: Any, *, slug_url: str, **kwargs: Any) -> Result:
        return Result(True, ANIMELIB_DETAIL)

    monkeypatch.setattr(animelib_org_parser.AnimelibOrgApi, "async_get_anime", fake_get_anime)

    loaded = await AnimelibAdapter().load(http_client, "316--serial-experiments-lain-anime")

    assert loaded is not None
    assert loaded.metadata.title == "Ковбой Бибоп"
    assert loaded.metadata.year == 1998
    assert loaded.metadata.dubbing_teams == ("AniLibria",)
    assert loaded.anime is not None


async def test_the_animelib_anime_is_not_found(http_client: Any, monkeypatch) -> None:
    """A failed request resolves to nothing."""
    from anicli_api.source.parsers import animelib_org_parser

    async def fake_get_anime(client: Any, *, slug_url: str, **kwargs: Any) -> Result:
        return Result(False)

    monkeypatch.setattr(animelib_org_parser.AnimelibOrgApi, "async_get_anime", fake_get_anime)

    assert await AnimelibAdapter().load(http_client, "missing") is None


async def test_the_animevost_anime_is_loaded(http_client: Any, monkeypatch) -> None:
    """An anime is loaded by searching for it."""
    from anicli_api.source import animevost

    class FakeSearch:
        def __init__(self, title: str, thumbnail: str, url: str, data: Any = None) -> None:
            self.title = title
            self.thumbnail = thumbnail
            self.url = url
            self.data = data

        async def a_get_anime(self) -> Any:
            class FakeAnime:
                title = ANIMEVOST_ITEM["title"]
                thumbnail = ANIMEVOST_ITEM["urlImagePreview"]
                description = ANIMEVOST_ITEM["description"]

            return FakeAnime()

    class FakeExtractor:
        def __init__(self, **kwargs: Any) -> None:
            self.kwargs = kwargs

        async def a_search(self, query: str) -> list[FakeSearch]:
            return [FakeSearch(ANIMEVOST_ITEM["title"], ANIMEVOST_ITEM["urlImagePreview"], "_", ANIMEVOST_ITEM)]

    monkeypatch.setattr(animevost, "Extractor", FakeExtractor)

    loaded = await AnimeVostAdapter().load(http_client, "1234", title_hint="Ковбой Бибоп")

    assert loaded is not None
    assert loaded.metadata.title.startswith("Ковбой Бибоп")
    assert loaded.anime is not None


async def test_the_animevost_anime_needs_a_title(http_client: Any) -> None:
    """Without a title hint the anime cannot be found."""
    assert await AnimeVostAdapter().load(http_client, "1234") is None


async def test_the_animevost_anime_is_not_found(http_client: Any, monkeypatch) -> None:
    """A search without a match resolves to nothing."""
    from anicli_api.source import animevost

    class FakeExtractor:
        def __init__(self, **kwargs: Any) -> None:
            self.kwargs = kwargs

        async def a_search(self, query: str) -> list[Any]:
            return []

    monkeypatch.setattr(animevost, "Extractor", FakeExtractor)

    assert await AnimeVostAdapter().load(http_client, "1234", title_hint="missing") is None


async def test_the_animego_anime_is_loaded(http_client: Any, monkeypatch) -> None:
    """An anime is loaded from its page."""
    from anicli_api.source import animego

    class FakeSearch:
        def __init__(self, title: str, thumbnail: str, url: str, **kwargs: Any) -> None:
            self.title = title
            self.thumbnail = thumbnail
            self.url = url

        async def a_get_anime(self) -> Any:
            class FakeAnime:
                title = "Ковбой Бибоп"
                thumbnail = "https://img.cdngos.com/poster.jpg"
                description = "Описание"

            return FakeAnime()

    monkeypatch.setattr(animego, "Search", FakeSearch)

    loaded = await AnimeGoAdapter().load(http_client, "/anime/kovboy-bibop-276")

    assert loaded is not None
    assert loaded.metadata.title == "Ковбой Бибоп"
    assert loaded.anime is not None


async def test_the_animego_anime_needs_an_url(http_client: Any) -> None:
    """Without an url the anime cannot be loaded."""
    assert await AnimeGoAdapter().load(http_client, "") is None
