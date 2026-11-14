"""Anime value objects and DTOs.

These models describe *our* domain.  They are intentionally **not** a mirror
image of the payload structure of AniList, of an anime website or of the
``anicli-api`` library: the integration adapters translate the external
structures into the models defined here.
"""

from __future__ import annotations

from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

__all__ = [
    "AnimeDetails",
    "AnimeGenre",
    "AnimeSummary",
    "ReleaseStatus",
    "normalize_title",
]


class ReleaseStatus(StrEnum):
    """Release status of a title."""

    UNKNOWN = "unknown"
    ONGOING = "ongoing"
    COMPLETED = "completed"
    UPCOMING = "upcoming"
    PAUSED = "paused"
    CANCELLED = "cancelled"


class AnimeGenre(BaseModel):
    """A single genre tag."""

    model_config = ConfigDict(frozen=True)

    name: str
    slug: str | None = None


def normalize_title(title: str) -> str:
    """Return a comparable key for a title.

    Used to detect the same title across providers.  The heuristic is
    deliberately simple and conservative: case folding, removal of punctuation
    and collapsing of whitespace.
    """
    cleaned = "".join(char.lower() if char.isalnum() or char.isspace() else " " for char in title)
    return " ".join(cleaned.split())


class AnimeSummary(BaseModel):
    """Short description of an anime, as returned by a catalog provider."""

    provider: str
    external_id: str
    title: str
    original_title: str | None = None
    alternative_title: str | None = None
    poster_url: str | None = None
    year: int | None = None
    genres: list[AnimeGenre] = Field(default_factory=list)
    total_episodes: int | None = None
    release_status: ReleaseStatus = ReleaseStatus.UNKNOWN
    external_url: str | None = None
    description: str | None = None
    dubbing_teams: list[str] = Field(default_factory=list)
    alternative_titles: list[str] = Field(default_factory=list)
    anime_id: UUID | None = None

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("title must not be empty")
        return stripped

    @property
    def title_key(self) -> str:
        """Return the normalized title used for cross provider matching."""
        return normalize_title(self.title)


class AnimeDetails(AnimeSummary):
    """Full description of an anime."""

    available_providers: list[str] = Field(default_factory=list)
