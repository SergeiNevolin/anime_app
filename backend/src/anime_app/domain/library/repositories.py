"""Persistence ports for the personal library."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol, runtime_checkable
from uuid import UUID

from anime_app.domain.library.models import LibraryEntry, LibraryStatus

__all__ = ["LibraryRepository"]


@runtime_checkable
class LibraryRepository(Protocol):
    """Storage operations for the personal library."""

    async def list_entries(
        self,
        user_id: UUID,
        *,
        status: LibraryStatus | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Sequence[LibraryEntry]:
        """Return the library entries of a user."""
        ...

    async def count(self, user_id: UUID, *, status: LibraryStatus | None = None) -> int:
        """Return the number of library entries of a user."""
        ...

    async def get(self, user_id: UUID, anime_id: UUID) -> LibraryEntry | None:
        """Return a single library entry."""
        ...

    async def upsert(
        self,
        *,
        user_id: UUID,
        anime_id: UUID,
        status: LibraryStatus,
        progress_episode: int,
    ) -> LibraryEntry:
        """Create or update a library entry."""
        ...

    async def delete(self, user_id: UUID, anime_id: UUID) -> bool:
        """Delete a library entry, returning whether it existed."""
        ...

    async def list_watching(self, user_id: UUID, *, limit: int = 10) -> Sequence[LibraryEntry]:
        """Return the entries with recorded progress, most recent first."""
        ...
