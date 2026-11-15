"""Personal library use cases."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from anime_app.core.exceptions import NotFoundError, ValidationError
from anime_app.core.pagination import Page, PageParams
from anime_app.domain.anime.entities import AnimeRepository
from anime_app.domain.anime.models import AnimeSummary
from anime_app.domain.library.models import LibraryEntry, LibraryItem, LibraryStatus
from anime_app.domain.library.repositories import LibraryRepository

__all__ = ["LibraryService"]

MAX_PROGRESS_EPISODE = 100_000


class LibraryService:
    """Manage the personal library of a user."""

    def __init__(
        self,
        library_repository: LibraryRepository,
        anime_repository: AnimeRepository,
    ) -> None:
        """Create the service.

        Args:
            library_repository: Storage of the library entries.
            anime_repository: Storage of the local catalogue.
        """
        self._library = library_repository
        self._anime = anime_repository

    async def list_entries(
        self,
        user_id: UUID,
        params: PageParams,
        *,
        status: LibraryStatus | None = None,
    ) -> Page[LibraryItem]:
        """Return the library entries of a user."""
        entries = await self._library.list_entries(
            user_id,
            status=status,
            limit=params.page_size,
            offset=params.offset,
        )
        total = await self._library.count(user_id, status=status)
        items = await self._enrich(entries)
        return Page[LibraryItem](
            items=items,
            page=params.page,
            page_size=params.page_size,
            total=total,
        )

    async def add(
        self,
        user_id: UUID,
        anime_id: UUID,
        *,
        status: LibraryStatus = LibraryStatus.PLAN_TO_WATCH,
        progress_episode: int = 0,
    ) -> LibraryItem:
        """Add an anime to the library of a user.

        Raises:
            NotFoundError: if the anime does not exist.
            ValidationError: if the progress value is invalid.
        """
        self._validate_progress(progress_episode)
        await self._ensure_anime(anime_id)
        entry = await self._library.upsert(
            user_id=user_id,
            anime_id=anime_id,
            status=status,
            progress_episode=progress_episode,
        )
        return (await self._enrich([entry]))[0]

    async def update(
        self,
        user_id: UUID,
        anime_id: UUID,
        *,
        status: LibraryStatus | None = None,
        progress_episode: int | None = None,
    ) -> LibraryItem:
        """Update the status or the progress of a library entry.

        Raises:
            NotFoundError: if the entry does not exist.
            ValidationError: if the progress value is invalid.
        """
        existing = await self._library.get(user_id, anime_id)
        if existing is None:
            raise NotFoundError("the anime is not in the library")
        if progress_episode is not None:
            self._validate_progress(progress_episode)
        entry = await self._library.upsert(
            user_id=user_id,
            anime_id=anime_id,
            status=status if status is not None else existing.status,
            progress_episode=(
                progress_episode if progress_episode is not None else existing.progress_episode
            ),
        )
        return (await self._enrich([entry]))[0]

    async def get_entry(self, user_id: UUID, anime_id: UUID) -> LibraryItem:
        """Return a single library entry of a user.

        Raises:
            NotFoundError: if the entry does not exist.
        """
        entry = await self._library.get(user_id, anime_id)
        if entry is None:
            raise NotFoundError("the anime is not in the library")
        return (await self._enrich([entry]))[0]

    async def delete(self, user_id: UUID, anime_id: UUID) -> None:
        """Remove an anime from the library of a user.

        Raises:
            NotFoundError: if the entry does not exist.
        """
        deleted = await self._library.delete(user_id, anime_id)
        if not deleted:
            raise NotFoundError("the anime is not in the library")

    async def continue_watching(self, user_id: UUID, *, limit: int = 10) -> list[LibraryItem]:
        """Return the entries with recorded progress, most recent first."""
        entries = await self._library.list_watching(user_id, limit=limit)
        return await self._enrich(entries)

    # -- helpers ----------------------------------------------------------

    async def _ensure_anime(self, anime_id: UUID) -> None:
        """Make sure the anime exists in the local catalogue."""
        record = await self._anime.get(anime_id)
        if record is None:
            raise NotFoundError("anime not found")

    @staticmethod
    def _validate_progress(progress_episode: int) -> None:
        """Validate the progress value."""
        if progress_episode < 0:
            raise ValidationError("progress_episode must not be negative")
        if progress_episode > MAX_PROGRESS_EPISODE:
            raise ValidationError("progress_episode is out of range")

    async def _enrich(self, entries: Sequence[LibraryEntry]) -> list[LibraryItem]:
        """Attach the anime summary to every library entry."""
        if not entries:
            return []
        summaries: dict[UUID, AnimeSummary] = {}
        for entry in entries:
            if entry.anime_id in summaries:
                continue
            record = await self._anime.get(entry.anime_id)
            if record is None:
                continue
            summaries[entry.anime_id] = AnimeSummary(
                provider=record.provider or "",
                external_id=record.external_id or "",
                title=record.canonical_title,
                original_title=record.original_title,
                poster_url=record.poster_url,
                genres=[],
                anime_id=record.id,
            )
        return [
            LibraryItem(
                id=entry.id,
                user_id=entry.user_id,
                anime_id=entry.anime_id,
                status=entry.status,
                progress_episode=entry.progress_episode,
                created_at=entry.created_at,
                updated_at=entry.updated_at,
                anime=summaries.get(entry.anime_id),
            )
            for entry in entries
        ]
