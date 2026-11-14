"""Integration tests of the database repositories and of the cache."""

from __future__ import annotations

import uuid

import pytest

from anime_app.domain.anime.entities import AnimeRefInput
from anime_app.domain.library.models import LibraryStatus
from anime_app.infrastructure.cache.base import NullCache
from anime_app.infrastructure.cache.redis_cache import RedisCache
from anime_app.infrastructure.database.repositories import (
    SqlAlchemyAnimeRepository,
    SqlAlchemyLibraryRepository,
    SqlAlchemyUserRepository,
)

pytestmark = pytest.mark.integration


# -- users -------------------------------------------------------------------


async def test_a_user_is_created_on_the_first_request(db_session) -> None:
    """The first request creates the user."""
    repository = SqlAlchemyUserRepository(db_session)

    user = await repository.get_or_create(telegram_id=100, username="ivan", first_name="Иван")

    assert user.telegram_id == 100
    assert user.username == "ivan"
    assert await repository.get_by_telegram_id(100) is not None


async def test_the_user_is_reused(db_session) -> None:
    """The second request resolves the same user."""
    repository = SqlAlchemyUserRepository(db_session)
    first = await repository.get_or_create(telegram_id=100)
    second = await repository.get_or_create(telegram_id=100)

    assert first.id == second.id


async def test_the_profile_is_updated(db_session) -> None:
    """The profile of an existing user is refreshed."""
    repository = SqlAlchemyUserRepository(db_session)
    await repository.get_or_create(telegram_id=100, username="old")

    user = await repository.get_or_create(telegram_id=100, username="new", language_code="ru")

    assert user.username == "new"
    assert user.language_code == "ru"


async def test_an_unknown_user_is_not_found(db_session) -> None:
    """An unknown Telegram identifier resolves to nothing."""
    repository = SqlAlchemyUserRepository(db_session)

    assert await repository.get_by_telegram_id(404) is None


async def test_the_last_seen_timestamp_is_updated(db_session) -> None:
    """The last seen timestamp is refreshed."""
    repository = SqlAlchemyUserRepository(db_session)
    user = await repository.get_or_create(telegram_id=100)
    before = user.last_seen_at

    await repository.touch(user.id)
    await db_session.commit()
    refreshed = await repository.get_by_telegram_id(100)

    assert refreshed is not None
    assert refreshed.last_seen_at >= before


# -- anime catalogue ---------------------------------------------------------


async def test_an_anime_is_created(db_session) -> None:
    """A provider entry is added to the catalogue."""
    repository = SqlAlchemyAnimeRepository(db_session)

    record = await repository.get_or_create(
        provider="fake",
        external_id="1",
        canonical_title="Ковбой Бибоп",
        title_key="ковбой бибоп",
        poster_url="https://example.org/poster.jpg",
    )

    assert record.canonical_title == "Ковбой Бибоп"
    assert record.provider == "fake"
    assert await repository.get(record.id) is not None


async def test_the_catalogue_entry_is_reused(db_session) -> None:
    """The same provider entry is only stored once."""
    repository = SqlAlchemyAnimeRepository(db_session)
    first = await repository.get_or_create(
        provider="fake",
        external_id="1",
        canonical_title="Ковбой Бибоп",
        title_key="ковбой бибоп",
    )
    second = await repository.get_or_create(
        provider="fake",
        external_id="1",
        canonical_title="Ковбой Бибоп",
        title_key="ковбой бибоп",
    )

    assert first.id == second.id


async def test_the_poster_is_completed(db_session) -> None:
    """A missing poster is filled in later."""
    repository = SqlAlchemyAnimeRepository(db_session)
    record = await repository.get_or_create(
        provider="fake",
        external_id="1",
        canonical_title="Ковбой Бибоп",
        title_key="ковбой бибоп",
    )

    updated = await repository.get_or_create(
        provider="fake",
        external_id="1",
        canonical_title="Ковбой Бибоп",
        title_key="ковбой бибоп",
        poster_url="https://example.org/poster.jpg",
    )

    assert updated.poster_url == "https://example.org/poster.jpg"
    assert updated.id == record.id


async def test_the_entries_are_created_in_bulk(db_session) -> None:
    """Many provider entries are stored at once."""
    repository = SqlAlchemyAnimeRepository(db_session)
    items = [
        AnimeRefInput(
            provider="fake",
            external_id=str(index),
            canonical_title=f"Title {index}",
            title_key=f"title {index}",
        )
        for index in range(5)
    ]

    records = await repository.get_or_create_many(items)

    assert len(records) == 5
    assert records[("fake", "0")].canonical_title == "Title 0"


async def test_the_bulk_creation_is_idempotent(db_session) -> None:
    """The bulk creation does not create duplicates."""
    repository = SqlAlchemyAnimeRepository(db_session)
    items = [
        AnimeRefInput(
            provider="fake",
            external_id="1",
            canonical_title="Title",
            title_key="title",
        )
    ]
    first = await repository.get_or_create_many(items)
    second = await repository.get_or_create_many(items)

    assert first[("fake", "1")].id == second[("fake", "1")].id


async def test_an_empty_bulk_creation_returns_nothing(db_session) -> None:
    """An empty list does not touch the database."""
    repository = SqlAlchemyAnimeRepository(db_session)

    assert await repository.get_or_create_many([]) == {}


async def test_the_siblings_of_a_title_are_found(db_session) -> None:
    """The other providers of the same title are found."""
    repository = SqlAlchemyAnimeRepository(db_session)
    first = await repository.get_or_create(
        provider="one",
        external_id="1",
        canonical_title="Ковбой Бибоп",
        title_key="ковбой бибоп",
    )
    await repository.get_or_create(
        provider="two",
        external_id="2",
        canonical_title="Ковбой Бибоп",
        title_key="ковбой бибоп",
    )

    siblings = await repository.find_siblings(first.id)

    assert len(siblings) == 1
    assert siblings[0].provider == "two"


async def test_the_external_references_are_listed(db_session) -> None:
    """Every provider reference of an entry is listed."""
    repository = SqlAlchemyAnimeRepository(db_session)
    record = await repository.get_or_create(
        provider="one",
        external_id="1",
        canonical_title="Title",
        title_key="title",
    )

    refs = await repository.list_refs(record.id)

    assert len(refs) == 1
    assert refs[0].provider == "one"


# -- library -----------------------------------------------------------------


async def test_a_library_entry_is_created(db_session) -> None:
    """An entry is added to the library."""
    users = SqlAlchemyUserRepository(db_session)
    anime = SqlAlchemyAnimeRepository(db_session)
    library = SqlAlchemyLibraryRepository(db_session)
    user = await users.get_or_create(telegram_id=100)
    record = await anime.get_or_create(
        provider="fake",
        external_id="1",
        canonical_title="Title",
        title_key="title",
    )

    entry = await library.upsert(
        user_id=user.id,
        anime_id=record.id,
        status=LibraryStatus.WATCHING,
        progress_episode=3,
    )

    assert entry.status == LibraryStatus.WATCHING
    assert entry.progress_episode == 3
    assert await library.get(user.id, record.id) is not None


async def test_a_library_entry_is_updated(db_session) -> None:
    """An existing entry is updated."""
    users = SqlAlchemyUserRepository(db_session)
    anime = SqlAlchemyAnimeRepository(db_session)
    library = SqlAlchemyLibraryRepository(db_session)
    user = await users.get_or_create(telegram_id=100)
    record = await anime.get_or_create(
        provider="fake",
        external_id="1",
        canonical_title="Title",
        title_key="title",
    )
    await library.upsert(
        user_id=user.id,
        anime_id=record.id,
        status=LibraryStatus.PLAN_TO_WATCH,
        progress_episode=0,
    )

    entry = await library.upsert(
        user_id=user.id,
        anime_id=record.id,
        status=LibraryStatus.COMPLETED,
        progress_episode=26,
    )

    assert entry.status == LibraryStatus.COMPLETED
    assert entry.progress_episode == 26
    assert await library.count(user.id) == 1


async def test_the_library_is_filtered_by_status(db_session) -> None:
    """The library entries are filtered by status."""
    users = SqlAlchemyUserRepository(db_session)
    anime = SqlAlchemyAnimeRepository(db_session)
    library = SqlAlchemyLibraryRepository(db_session)
    user = await users.get_or_create(telegram_id=100)
    first = await anime.get_or_create(
        provider="fake", external_id="1", canonical_title="A", title_key="a"
    )
    second = await anime.get_or_create(
        provider="fake", external_id="2", canonical_title="B", title_key="b"
    )
    await library.upsert(
        user_id=user.id,
        anime_id=first.id,
        status=LibraryStatus.WATCHING,
        progress_episode=1,
    )
    await library.upsert(
        user_id=user.id,
        anime_id=second.id,
        status=LibraryStatus.COMPLETED,
        progress_episode=26,
    )

    watching = await library.list_entries(user.id, status=LibraryStatus.WATCHING)

    assert len(watching) == 1
    assert watching[0].anime_id == first.id
    assert await library.count(user.id, status=LibraryStatus.COMPLETED) == 1


async def test_a_library_entry_is_deleted(db_session) -> None:
    """An entry is removed from the library."""
    users = SqlAlchemyUserRepository(db_session)
    anime = SqlAlchemyAnimeRepository(db_session)
    library = SqlAlchemyLibraryRepository(db_session)
    user = await users.get_or_create(telegram_id=100)
    record = await anime.get_or_create(
        provider="fake", external_id="1", canonical_title="A", title_key="a"
    )
    await library.upsert(
        user_id=user.id,
        anime_id=record.id,
        status=LibraryStatus.WATCHING,
        progress_episode=1,
    )

    assert await library.delete(user.id, record.id) is True
    assert await library.delete(user.id, record.id) is False


async def test_the_started_titles_are_listed(db_session) -> None:
    """Only the titles with a progress are returned."""
    users = SqlAlchemyUserRepository(db_session)
    anime = SqlAlchemyAnimeRepository(db_session)
    library = SqlAlchemyLibraryRepository(db_session)
    user = await users.get_or_create(telegram_id=100)
    started = await anime.get_or_create(
        provider="fake", external_id="1", canonical_title="A", title_key="a"
    )
    planned = await anime.get_or_create(
        provider="fake", external_id="2", canonical_title="B", title_key="b"
    )
    await library.upsert(
        user_id=user.id,
        anime_id=started.id,
        status=LibraryStatus.WATCHING,
        progress_episode=2,
    )
    await library.upsert(
        user_id=user.id,
        anime_id=planned.id,
        status=LibraryStatus.PLAN_TO_WATCH,
        progress_episode=0,
    )

    items = await library.list_watching(user.id)

    assert len(items) == 1
    assert items[0].anime_id == started.id


async def test_the_library_is_isolated_per_user(db_session) -> None:
    """Every user has its own library."""
    users = SqlAlchemyUserRepository(db_session)
    anime = SqlAlchemyAnimeRepository(db_session)
    library = SqlAlchemyLibraryRepository(db_session)
    first = await users.get_or_create(telegram_id=100)
    second = await users.get_or_create(telegram_id=200)
    record = await anime.get_or_create(
        provider="fake", external_id="1", canonical_title="A", title_key="a"
    )
    await library.upsert(
        user_id=first.id,
        anime_id=record.id,
        status=LibraryStatus.WATCHING,
        progress_episode=1,
    )

    assert await library.list_entries(second.id) == []
    assert len(await library.list_entries(first.id)) == 1


# -- cache -------------------------------------------------------------------


async def test_the_null_cache_stores_nothing() -> None:
    """The degraded cache never returns a value."""
    cache = NullCache()

    await cache.set("key", "value", ttl=60)

    assert await cache.get("key") is None
    assert await cache.increment("key", ttl=60) == 0
    assert await cache.ping() is True


async def test_the_redis_cache_stores_the_values() -> None:
    """The Redis cache stores and returns the values."""
    from redis.asyncio import Redis
    from redis.exceptions import RedisError

    from tests.conftest import TEST_REDIS_URL

    client = Redis.from_url(TEST_REDIS_URL, encoding="utf-8", decode_responses=True)
    cache = RedisCache(client, namespace="test")
    try:
        await cache.set("answer", "42", ttl=30)
        if not await cache.ping():
            pytest.skip("the Redis test instance is not reachable")
        assert await cache.get("answer") == "42"

        await cache.delete("answer")
        assert await cache.get("answer") is None
    except RedisError as exc:  # pragma: no cover - depends on the environment
        pytest.skip(f"the Redis test instance is not reachable: {exc}")
    finally:
        await client.aclose()


async def test_the_redis_cache_counts_the_requests() -> None:
    """The Redis cache increments the counters."""
    from redis.asyncio import Redis
    from redis.exceptions import RedisError

    from tests.conftest import TEST_REDIS_URL

    client = Redis.from_url(TEST_REDIS_URL, encoding="utf-8", decode_responses=True)
    cache = RedisCache(client, namespace="test")
    try:
        await client.delete("test:counter")
        if not await cache.ping():
            pytest.skip("the Redis test instance is not reachable")
        assert await cache.increment("counter", ttl=30) == 1
        assert await cache.increment("counter", ttl=30) == 2
    except RedisError as exc:  # pragma: no cover - depends on the environment
        pytest.skip(f"the Redis test instance is not reachable: {exc}")
    finally:
        await client.aclose()


async def test_the_redis_cache_survives_an_outage() -> None:
    """A cache outage never raises."""
    from redis.asyncio import Redis

    client = Redis.from_url("redis://127.0.0.1:6399/15", encoding="utf-8", decode_responses=True)
    cache = RedisCache(client, namespace="test")
    try:
        assert await cache.get("key") is None
        assert await cache.ping() is False
        await cache.set("key", "value", ttl=10)
        await cache.delete("key")
        assert await cache.increment("key", ttl=10) == 0
    finally:
        await client.aclose()
