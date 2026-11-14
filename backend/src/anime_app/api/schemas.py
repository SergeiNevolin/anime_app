"""Request and response schemas of the HTTP API.

The response models reuse the domain DTOs so that the API contract and the
business logic cannot drift apart.  Only the *request* bodies and the error
envelope are defined here.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from anime_app.domain.library.models import LibraryStatus

__all__ = [
    "ErrorBody",
    "ErrorResponse",
    "HealthResponse",
    "LibraryCreateRequest",
    "LibraryUpdateRequest",
]


class ErrorBody(BaseModel):
    """Body of the unified error envelope."""

    code: str
    message: str
    request_id: str


class ErrorResponse(BaseModel):
    """Unified error envelope returned by every failing endpoint."""

    error: ErrorBody


class HealthResponse(BaseModel):
    """Payload of the health endpoints."""

    status: str
    version: str
    checks: dict[str, bool] = Field(default_factory=dict)


class LibraryCreateRequest(BaseModel):
    """Payload used to add an anime to the library."""

    model_config = ConfigDict(extra="forbid")

    anime_id: UUID
    status: LibraryStatus = LibraryStatus.PLAN_TO_WATCH
    progress_episode: int = Field(default=0, ge=0, le=100_000)


class LibraryUpdateRequest(BaseModel):
    """Payload used to update a library entry."""

    model_config = ConfigDict(extra="forbid")

    status: LibraryStatus | None = None
    progress_episode: int | None = Field(default=None, ge=0, le=100_000)
