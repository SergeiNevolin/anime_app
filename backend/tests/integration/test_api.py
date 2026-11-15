"""Integration tests of the HTTP API."""

from __future__ import annotations

import uuid

import pytest

from anime_app.domain.anime.models import AnimeDetails, AnimeGenre, AnimeSummary, ReleaseStatus
from anime_app.domain.episode.models import (
    AnimeEpisode,
    EpisodeSource,
    PlaybackKind,
    PlaybackOption,
    encode_episode_id,
)
from anime_app.domain.providers.base import ProviderInfo, ProviderKind
from tests.conftest import build_init_data
from tests.fixtures.fakes import FakeCatalogProvider, FakePlaybackProvider

pytestmark = pytest.mark.integration


@pytest.fixture
def catalog_provider() -> FakeCatalogProvider:
    """Return a deterministic catalog provider."""
    return FakeCatalogProvider(
        [
            AnimeSummary(
                provider="fake",
                external_id="1",
                title="Ковбой Бибоп",
                original_title="Cowboy Bebop",
                poster_url="https://example.org/poster.jpg",
                year=1998,
                genres=[AnimeGenre(name="Комедия")],
                release_status=ReleaseStatus.COMPLETED,
                description="Описание",
            )
        ],
        details=AnimeDetails(
            provider="fake",
            external_id="1",
            title="Ковбой Бибоп",
            description="Описание",
            genres=[AnimeGenre(name="Комедия")],
            year=1998,
        ),
        episodes=[
            AnimeEpisode(
                provider="fake",
                anime_external_id="1",
                external_id="ep-1",
                number=1,
                title="Первый эпизод",
            )
        ],
    )


@pytest.fixture
def playback_provider() -> FakePlaybackProvider:
    """Return a deterministic playback provider."""
    return FakePlaybackProvider(
        sources=[
            EpisodeSource(
                provider="fake",
                key="sourcekey00000001",
                title="Озвучка AniLibria",
                player="kodik",
                official_url="https://example.org/anime",
            )
        ],
        options=[
            PlaybackOption(
                provider="fake",
                source_key="sourcekey00000001",
                source_title="Озвучка AniLibria",
                kind=PlaybackKind.HLS,
                quality=720,
                url="https://example.org/master.m3u8",
                headers={"Referer": "https://example.org"},
            )
        ],
    )


@pytest.fixture
def providers(registry, catalog_provider, playback_provider):
    """Register the deterministic providers."""
    registry.register(
        ProviderInfo(
            id="fake",
            name="Fake",
            kind=ProviderKind.CATALOG,
            supports_search=True,
            supports_episodes=True,
            supports_playback=True,
        ),
        catalog=catalog_provider,
        playback=playback_provider,
    )
    return registry


# -- health ------------------------------------------------------------------


async def test_the_liveness_probe_answers(client) -> None:
    """The liveness probe does not need any dependency."""
    response = await client.get("/health/live")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_the_readiness_probe_reports_the_checks(client) -> None:
    """The readiness probe checks the dependencies."""
    response = await client.get("/health/ready")

    assert response.status_code == 200
    payload = response.json()
    assert payload["checks"]["database"] is True


async def test_every_response_carries_a_request_id(client) -> None:
    """Every response carries the request id."""
    response = await client.get("/health/live")

    assert response.headers["X-Request-ID"]


async def test_the_request_id_of_the_client_is_reused(client) -> None:
    """The request id of the client is reused."""
    response = await client.get("/health/live", headers={"X-Request-ID": "my-request"})

    assert response.headers["X-Request-ID"] == "my-request"


# -- authentication ----------------------------------------------------------


async def test_the_current_user_is_returned(client) -> None:
    """The development provider authenticates a test user."""
    response = await client.get("/api/v1/auth/me")

    assert response.status_code == 200
    payload = response.json()
    assert payload["telegram_id"] == 777_000
    assert payload["username"] == "dev_user"


async def test_a_missing_authorization_header_is_rejected(client) -> None:
    """A request without credentials is rejected."""
    response = await client.get("/api/v1/auth/me", headers={"Authorization": ""})

    assert response.status_code == 401
    error = response.json()["error"]
    assert error["code"] == "UNAUTHORIZED"
    assert error["request_id"]


async def test_an_invalid_init_data_is_rejected(client) -> None:
    """A forged init data payload is rejected."""
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "tma auth_date=1&hash=deadbeef"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_INIT_DATA"


async def test_a_valid_init_data_creates_the_user(client) -> None:
    """A valid init data payload authenticates the user."""
    init_data = build_init_data(
        "123456789:AAHtestTokenForUnitTestsOnly0000000000",
        {"id": 4242, "first_name": "Тест", "username": "tester"},
    )

    response = await client.get("/api/v1/auth/me", headers={"Authorization": f"tma {init_data}"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["telegram_id"] == 4242
    assert payload["username"] == "tester"


async def test_the_init_data_is_not_logged(client, caplog) -> None:
    """The init data never appears in the logs."""
    init_data = build_init_data(
        "123456789:AAHtestTokenForUnitTestsOnly0000000000",
        {"id": 4242},
    )

    with caplog.at_level("INFO"):
        await client.get("/api/v1/auth/me", headers={"Authorization": f"tma {init_data}"})

    assert init_data not in caplog.text


# -- providers ---------------------------------------------------------------


async def test_the_providers_are_listed(client, providers) -> None:
    """The registered providers are listed."""
    response = await client.get("/api/v1/providers")

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["id"] == "fake"


# -- search ------------------------------------------------------------------


async def test_the_search_returns_results(client, providers) -> None:
    """The search returns the results of the provider."""
    response = await client.get("/api/v1/anime/search", params={"query": "bebop"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["items"][0]["title"] == "Ковбой Бибоп"
    assert payload["items"][0]["anime_id"]
    assert payload["page"] == 1


async def test_the_search_requires_a_long_query(client, providers) -> None:
    """A too short query is rejected by the API."""
    response = await client.get("/api/v1/anime/search", params={"query": "a"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_the_search_requires_authentication(client, providers) -> None:
    """The search requires an authenticated user."""
    response = await client.get(
        "/api/v1/anime/search",
        params={"query": "bebop"},
        headers={"Authorization": ""},
    )

    assert response.status_code == 401


async def test_the_search_paginates(client, providers) -> None:
    """The search accepts the pagination parameters."""
    response = await client.get(
        "/api/v1/anime/search",
        params={"query": "bebop", "page": 2, "page_size": 5},
    )

    assert response.status_code == 200
    assert response.json()["page"] == 2


# -- details and episodes ----------------------------------------------------


async def test_the_details_of_an_anime_are_returned(client, providers) -> None:
    """The details of a catalog entry are returned."""
    search = await client.get("/api/v1/anime/search", params={"query": "bebop"})
    anime_id = search.json()["items"][0]["anime_id"]

    response = await client.get(f"/api/v1/anime/{anime_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["title"] == "Ковбой Бибоп"
    assert payload["description"] == "Описание"
    assert payload["genres"][0]["name"] == "Комедия"


async def test_the_details_of_an_unknown_anime_are_reported(client, providers) -> None:
    """An unknown catalog entry is reported as not found."""
    response = await client.get(f"/api/v1/anime/{uuid.uuid4()}")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


async def test_the_episodes_of_an_anime_are_returned(client, providers) -> None:
    """The episodes of a catalog entry are returned."""
    search = await client.get("/api/v1/anime/search", params={"query": "bebop"})
    anime_id = search.json()["items"][0]["anime_id"]

    response = await client.get(f"/api/v1/anime/{anime_id}/episodes")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["number"] == 1
    assert payload["items"][0]["id"]


async def test_the_sources_of_an_episode_are_returned(client, providers) -> None:
    """The sources of an episode are returned."""
    episode_id = encode_episode_id("fake", "1", "ep-1")

    response = await client.get(f"/api/v1/episodes/{episode_id}/sources")

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["title"] == "Озвучка AniLibria"
    assert payload[0]["official_url"] == "https://example.org/anime"


async def test_the_playback_options_are_returned(client, providers) -> None:
    """The playable streams of a source are returned."""
    episode_id = encode_episode_id("fake", "1", "ep-1")

    response = await client.get(f"/api/v1/episodes/{episode_id}/sources/sourcekey00000001/playback")

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["kind"] == "hls"
    assert payload[0]["url"] == "https://example.org/master.m3u8"


async def test_a_malformed_episode_id_is_rejected(client, providers) -> None:
    """A malformed episode identifier is rejected."""
    response = await client.get("/api/v1/episodes/not-an-id/sources")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


# -- library -----------------------------------------------------------------


async def test_the_library_is_empty_by_default(client, providers) -> None:
    """A new user does not have any library entry."""
    response = await client.get("/api/v1/library")

    assert response.status_code == 200
    payload = response.json()
    assert payload["items"] == []
    assert payload["total"] == 0


async def test_an_anime_is_added_to_the_library(client, providers) -> None:
    """An anime can be added to the library."""
    search = await client.get("/api/v1/anime/search", params={"query": "bebop"})
    anime_id = search.json()["items"][0]["anime_id"]

    response = await client.post("/api/v1/library", json={"anime_id": anime_id})

    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "plan_to_watch"
    assert payload["anime"]["title"] == "Ковбой Бибоп"


async def test_the_library_entry_is_updated(client, providers) -> None:
    """The status and the progress of an entry can be updated."""
    search = await client.get("/api/v1/anime/search", params={"query": "bebop"})
    anime_id = search.json()["items"][0]["anime_id"]
    await client.post("/api/v1/library", json={"anime_id": anime_id})

    response = await client.patch(
        f"/api/v1/library/{anime_id}",
        json={"status": "watching", "progress_episode": 5},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "watching"
    assert payload["progress_episode"] == 5


async def test_the_library_can_be_filtered_by_status(client, providers) -> None:
    """The library can be filtered by status."""
    search = await client.get("/api/v1/anime/search", params={"query": "bebop"})
    anime_id = search.json()["items"][0]["anime_id"]
    await client.post("/api/v1/library", json={"anime_id": anime_id})

    response = await client.get("/api/v1/library", params={"status": "watching"})

    assert response.status_code == 200
    assert response.json()["total"] == 0

    response = await client.get("/api/v1/library", params={"status": "plan_to_watch"})

    assert response.json()["total"] == 1


async def test_a_single_library_entry_is_returned(client, providers) -> None:
    """The entry of a single anime can be requested."""
    search = await client.get("/api/v1/anime/search", params={"query": "bebop"})
    anime_id = search.json()["items"][0]["anime_id"]
    await client.post("/api/v1/library", json={"anime_id": anime_id})

    response = await client.get(f"/api/v1/library/{anime_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["anime_id"] == anime_id
    assert payload["status"] == "plan_to_watch"


async def test_a_missing_library_entry_is_reported(client, providers) -> None:
    """An anime that is not in the library is reported as not found."""
    response = await client.get(f"/api/v1/library/{uuid.uuid4()}")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


async def test_the_continue_watching_list_is_returned(client, providers) -> None:
    """The titles in progress are returned."""
    search = await client.get("/api/v1/anime/search", params={"query": "bebop"})
    anime_id = search.json()["items"][0]["anime_id"]
    await client.post("/api/v1/library", json={"anime_id": anime_id})
    await client.patch(f"/api/v1/library/{anime_id}", json={"progress_episode": 3})

    response = await client.get("/api/v1/library/continue")

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["progress_episode"] == 3


async def test_an_anime_is_removed_from_the_library(client, providers) -> None:
    """An anime can be removed from the library."""
    search = await client.get("/api/v1/anime/search", params={"query": "bebop"})
    anime_id = search.json()["items"][0]["anime_id"]
    await client.post("/api/v1/library", json={"anime_id": anime_id})

    response = await client.delete(f"/api/v1/library/{anime_id}")

    assert response.status_code == 204

    listing = await client.get("/api/v1/library")
    assert listing.json()["total"] == 0


async def test_removing_a_missing_entry_is_reported(client, providers) -> None:
    """Removing a missing entry is reported as not found."""
    response = await client.delete(f"/api/v1/library/{uuid.uuid4()}")

    assert response.status_code == 404


async def test_an_unknown_anime_cannot_be_added(client, providers) -> None:
    """An unknown catalog entry cannot be added to the library."""
    response = await client.post("/api/v1/library", json={"anime_id": str(uuid.uuid4())})

    assert response.status_code == 404


async def test_an_invalid_payload_is_rejected(client, providers) -> None:
    """An invalid request body is rejected."""
    response = await client.post("/api/v1/library", json={"anime_id": "not-a-uuid"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_an_unknown_field_is_rejected(client, providers) -> None:
    """An unknown request field is rejected."""
    response = await client.post(
        "/api/v1/library",
        json={"anime_id": str(uuid.uuid4()), "unexpected": True},
    )

    assert response.status_code == 422
