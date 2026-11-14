"""Persistence ports for the anime catalog."""

from __future__ import annotations

from datetime import datetime
from typing import Protocol, runtime_checkable
from uuid import UUID

from pydantic import BaseModel, ConfigDict

__all__ = ["AnimeExternalRef", "AnimeRecord", "AnimeRefInput", "AnimeRepository"]


class AnimeRefInput(BaseModel):
    """Provider entry that has to be present in the local catalogue."""

    provider: str
    external_id: str
    canonical_title: str
    title_key: str
    poster_url: str | None = None
    original_title: str | None = None
    external_url: str | None = None


class AnimeExternalRef(BaseModel):
    """Link between an internal anime and an external provider entry."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    anime_id: UUID
    provider: str
    external_id: str
    external_url: str | None = None


class AnimeRecord(BaseModel):
    """A persisted anime catalog entry together with its primary reference."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    canonical_title: str
    title_key: str = ""
    poster_url: str | None = None
    original_title: str | None = None
    provider: str | None = None
    external_id: str | None = None
    external_url: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


@runtime_checkable
class AnimeRepository(Protocol):
    """Storage operations for the anime catalog."""

    async def get(self, anime_id: UUID) -> AnimeRecord | None:
        """Return a catalog entry by its identifier."""
        ...

    async def get_by_external_ref(self, provider: str, external_id: str) -> AnimeRecord | None:
        """Return a catalog entry by provider scoped external identifier."""
        ...

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
        """Return the catalog entry for a provider entry, creating it if needed."""
        ...

    async def list_refs(self, anime_id: UUID) -> list[AnimeExternalRef]:
        """Return every provider reference of a catalog entry."""
        ...

    async def get_or_create_many(
        self,
        items: list[AnimeRefInput],
    ) -> dict[tuple[str, str], AnimeRecord]:
        """Return the catalog entries of many provider entries at once.

        The result is keyed by ``(provider, external_id)``.
        """
        ...

    async def list_by_title_key(self, title_key: str) -> list[AnimeRecord]:
        """Return every catalog entry sharing the given normalized title."""
        ...

    async def find_siblings(self, anime_id: UUID) -> list[AnimeRecord]:
        """Return other catalog entries that represent the same title."""
        ...
