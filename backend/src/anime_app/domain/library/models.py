"""User library domain models."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from anime_app.domain.anime.models import AnimeSummary

__all__ = ["LibraryEntry", "LibraryItem", "LibraryStatus"]


class LibraryStatus(StrEnum):
    """Status of an anime inside the personal library."""

    PLAN_TO_WATCH = "plan_to_watch"
    WATCHING = "watching"
    COMPLETED = "completed"
    ON_HOLD = "on_hold"
    DROPPED = "dropped"


class LibraryEntry(BaseModel):
    """A persisted library record."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    anime_id: UUID
    status: LibraryStatus = LibraryStatus.PLAN_TO_WATCH
    progress_episode: int = 0
    created_at: datetime
    updated_at: datetime


class LibraryItem(LibraryEntry):
    """A library record enriched with the anime summary."""

    anime: AnimeSummary | None = None
