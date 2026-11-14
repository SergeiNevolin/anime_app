"""In-memory test doubles of the domain ports."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from anime_app.core.exceptions import ProviderError, ProviderTimeoutError, ProviderUnavailableError
from anime_app.domain.anime.entities import AnimeExternalRef, AnimeRecord, AnimeRefInput
from anime_app.domain.anime.models import AnimeDetails, AnimeSummary
from anime_app.domain.episode.models import AnimeEpisode, EpisodeSource, PlaybackOption
from anime_app.domain.library.models import LibraryEntry, LibraryStatus
from anime_app.domain.user.models import AuthenticatedIdentity, User

__all__ = [
    "FakeAnimeRepository",
    "FakeCatalogProvider",
    "FakeLibraryRepository",
    "FakePlaybackProvider",
    "FakeUserRepository",
]


def _now() -> datetime:
    return datetime.now(UTC)


class FakeUserRepository:
    """In-memory user storage."""

    def __init__(self) -> None:
        self.users: dict[int, User] = {}
        self.touched: list[UUID] = []

    async def get_by_telegram_id(self, telegram_id: int) -> User | None:
        """Return the user with the given Telegram identifier."""
        return self.users.get(telegram_id)

    async def get_or_create(
        self,
        *,
        telegram_id: int,
        username: str | None = None,
        first_name: str | None = None,
        language_code: str | None = None,
    ) -> User:
        """Return the user, creating it when it does not exist yet."""
        user = self.users.get(telegram_id)
        if user is None:
            user = User(
                id=uuid.uuid4(),
                telegram_id=telegram_id,
                username=username,
                first_name=first_name,
                language_code=language_code,
            )
            self.users[telegram_id] = user
        return user

    async def touch(self, user_id: object) -> None:
        """Record that the user was seen."""
        self.touched.append(user_id)  # type: ignore[arg-type]


class FakeAnimeRepository:
    """In-memory anime catalogue."""

    def __init__(self) -> None:
        self.records: dict[UUID, AnimeRecord] = {}
        self.refs: dict[tuple[str, str], AnimeExternalRef] = {}

    async def get(self, anime_id: UUID) -> AnimeRecord | None:
        """Return a catalogue entry."""
        return self.records.get(anime_id)

    async def get_by_external_ref(self, provider: str, external_id: str) -> AnimeRecord | None:
        """Return a catalogue entry by provider reference."""
        ref = self.refs.get((provider, external_id))
        return self.records.get(ref.anime_id) if ref else None

    async def get_or_create(
        self,
        *,
        provider: str,
        external_id: str,
        canonical_title: str,
        title_key: str,
        poster_url: str | None = None,
        original_title: str | None = None,
        external_url: str | None = None,
    ) -> AnimeRecord:
        """Return the catalogue entry of a provider reference."""
        existing = await self.get_by_external_ref(provider, external_id)
        if existing is not None:
            return existing
        record = AnimeRecord(
            id=uuid.uuid4(),
            canonical_title=canonical_title,
            title_key=title_key,
            poster_url=poster_url,
            original_title=original_title,
            provider=provider,
            external_id=external_id,
            external_url=external_url,
            created_at=_now(),
            updated_at=_now(),
        )
        self.records[record.id] = record
        self.refs[(provider, external_id)] = AnimeExternalRef(
            id=uuid.uuid4(),
            anime_id=record.id,
            provider=provider,
            external_id=external_id,
            external_url=external_url,
        )
        return record

    async def get_or_create_many(
        self,
        items: list[AnimeRefInput],
    ) -> dict[tuple[str, str], AnimeRecord]:
        """Return the catalogue entries of many provider references."""
        result: dict[tuple[str, str], AnimeRecord] = {}
        for item in items:
            record = await self.get_or_create(
                provider=item.provider,
                external_id=item.external_id,
                canonical_title=item.canonical_title,
                title_key=item.title_key,
                poster_url=item.poster_url,
                original_title=item.original_title,
                external_url=item.external_url,
            )
            result[(item.provider, item.external_id)] = record
        return result

    async def list_refs(self, anime_id: UUID) -> list[AnimeExternalRef]:
        """Return the provider references of a catalogue entry."""
        return [ref for ref in self.refs.values() if ref.anime_id == anime_id]

    async def list_by_title_key(self, title_key: str) -> list[AnimeRecord]:
        """Return the catalogue entries sharing a normalized title."""
        return [record for record in self.records.values() if record.title_key == title_key]

    async def find_siblings(self, anime_id: UUID) -> list[AnimeRecord]:
        """Return the other catalogue entries of the same title."""
        record = self.records.get(anime_id)
        if record is None:
            return []
        return [
            item
            for item in self.records.values()
            if item.title_key == record.title_key and item.id != anime_id
        ]


class FakeLibraryRepository:
    """In-memory library storage."""

    def __init__(self) -> None:
        self.entries: dict[tuple[UUID, UUID], LibraryEntry] = {}

    async def list_entries(
        self,
        user_id: UUID,
        *,
        status: LibraryStatus | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[LibraryEntry]:
        """Return the library entries of a user."""
        items = [
            entry
            for entry in self.entries.values()
            if entry.user_id == user_id and (status is None or entry.status == status)
        ]
        items.sort(key=lambda entry: entry.updated_at, reverse=True)
        return items[offset : offset + limit]

    async def count(self, user_id: UUID, *, status: LibraryStatus | None = None) -> int:
        """Return the number of library entries of a user."""
        return len(
            [
                entry
                for entry in self.entries.values()
                if entry.user_id == user_id and (status is None or entry.status == status)
            ]
        )

    async def get(self, user_id: UUID, anime_id: UUID) -> LibraryEntry | None:
        """Return a single library entry."""
        return self.entries.get((user_id, anime_id))

    async def upsert(
        self,
        *,
        user_id: UUID,
        anime_id: UUID,
        status: LibraryStatus,
        progress_episode: int,
    ) -> LibraryEntry:
        """Create or update a library entry."""
        key = (user_id, anime_id)
        entry = self.entries.get(key)
        if entry is None:
            entry = LibraryEntry(
                id=uuid.uuid4(),
                user_id=user_id,
                anime_id=anime_id,
                status=status,
                progress_episode=progress_episode,
                created_at=_now(),
                updated_at=_now(),
            )
        else:
            entry.status = status
            entry.progress_episode = progress_episode
            entry.updated_at = _now()
        self.entries[key] = entry
        return entry

    async def delete(self, user_id: UUID, anime_id: UUID) -> bool:
        """Delete a library entry."""
        return self.entries.pop((user_id, anime_id), None) is not None

    async def list_watching(self, user_id: UUID, *, limit: int = 10) -> list[LibraryEntry]:
        """Return the entries with a recorded progress."""
        items = [
            entry
            for entry in self.entries.values()
            if entry.user_id == user_id and entry.progress_episode > 0
        ]
        items.sort(key=lambda entry: entry.updated_at, reverse=True)
        return items[:limit]


class FakeCatalogProvider:
    """A deterministic catalog provider."""

    provider_id = "fake"
    display_name = "Fake"

    def __init__(
        self,
        results: list[AnimeSummary] | None = None,
        *,
        details: AnimeDetails | None = None,
        episodes: list[AnimeEpisode] | None = None,
        error: Exception | None = None,
    ) -> None:
        self.results = results or []
        self.details = details
        self.episodes = episodes or []
        self.error = error
        self.search_calls: list[tuple[str, int, int]] = []

    async def search(self, query: str, *, limit: int, offset: int) -> list[AnimeSummary]:
        """Return the configured search results."""
        self.search_calls.append((query, limit, offset))
        if self.error is not None:
            raise self.error
        return self.results[offset : offset + limit]

    async def get_details(self, external_id: str, *, title_hint: str | None = None) -> AnimeDetails:
        """Return the configured details."""
        if self.error is not None:
            raise self.error
        if self.details is None:
            raise ProviderUnavailableError("no details configured")
        return self.details

    async def get_episodes(
        self,
        external_id: str,
        *,
        title_hint: str | None = None,
    ) -> list[AnimeEpisode]:
        """Return the configured episodes."""
        if self.error is not None:
            raise self.error
        return self.episodes


class FakePlaybackProvider:
    """A deterministic playback provider."""

    provider_id = "fake"
    display_name = "Fake"

    def __init__(
        self,
        sources: list[EpisodeSource] | None = None,
        options: list[PlaybackOption] | None = None,
        *,
        error: Exception | None = None,
    ) -> None:
        self.sources = sources or []
        self.options = options or []
        self.error = error

    async def get_sources(
        self,
        anime_external_id: str,
        episode_external_id: str,
        *,
        title_hint: str | None = None,
    ) -> list[EpisodeSource]:
        """Return the configured sources."""
        if self.error is not None:
            raise self.error
        return self.sources

    async def get_playback_options(
        self,
        anime_external_id: str,
        episode_external_id: str,
        source_key: str,
        *,
        title_hint: str | None = None,
    ) -> list[PlaybackOption]:
        """Return the configured playback options."""
        if self.error is not None:
            raise self.error
        return self.options


class RecordingAuthProvider:
    """An authentication provider that records the received credentials."""

    scheme = "test"

    def __init__(self, identity: AuthenticatedIdentity | None = None) -> None:
        self.identity = identity or AuthenticatedIdentity(telegram_id=1)
        self.credentials: list[str] = []

    async def authenticate(self, credential: str) -> AuthenticatedIdentity:
        """Return the configured identity."""
        self.credentials.append(credential)
        return self.identity


def provider_error(kind: str = "unavailable") -> Exception:
    """Return a provider error of the requested kind."""
    if kind == "timeout":
        return ProviderTimeoutError("timeout")
    if kind == "error":
        return ProviderError("error")
    return ProviderUnavailableError("unavailable")


__all_errors__ = Any
