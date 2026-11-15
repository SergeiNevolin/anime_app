"""Personal library endpoints."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response, status

from anime_app.api.dependencies import CurrentUser, LibraryServiceDep
from anime_app.api.schemas import LibraryCreateRequest, LibraryUpdateRequest
from anime_app.core.pagination import Page, PageParams
from anime_app.domain.library.models import LibraryItem, LibraryStatus

__all__ = ["router"]

router = APIRouter(prefix="/library", tags=["library"])


@router.get("", response_model=Page[LibraryItem], summary="Return the personal library")
async def read_library(
    service: LibraryServiceDep,
    user: CurrentUser,
    library_status: Annotated[LibraryStatus | None, Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[LibraryItem]:
    """Return the library entries of the current user."""
    return await service.list_entries(
        user.id,
        PageParams(page=page, page_size=page_size),
        status=library_status,
    )


@router.get("/continue", response_model=list[LibraryItem], summary="Return the titles in progress")
async def read_continue_watching(
    service: LibraryServiceDep,
    user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> list[LibraryItem]:
    """Return the titles the user started to watch."""
    return await service.continue_watching(user.id, limit=limit)


@router.get(
    "/{anime_id}",
    response_model=LibraryItem,
    summary="Return a single library entry",
)
async def read_library_entry(
    anime_id: UUID,
    service: LibraryServiceDep,
    user: CurrentUser,
) -> LibraryItem:
    """Return the library entry of a single anime.

    The route is declared after ``/continue`` so that the static path wins
    over the parameterised one.
    """
    return await service.get_entry(user.id, anime_id)


@router.post(
    "",
    response_model=LibraryItem,
    status_code=status.HTTP_201_CREATED,
    summary="Add an anime to the library",
)
async def create_library_entry(
    payload: LibraryCreateRequest,
    service: LibraryServiceDep,
    user: CurrentUser,
) -> LibraryItem:
    """Add an anime to the personal library of the current user."""
    return await service.add(
        user.id,
        payload.anime_id,
        status=payload.status,
        progress_episode=payload.progress_episode,
    )


@router.patch(
    "/{anime_id}",
    response_model=LibraryItem,
    summary="Update a library entry",
)
async def update_library_entry(
    anime_id: UUID,
    payload: LibraryUpdateRequest,
    service: LibraryServiceDep,
    user: CurrentUser,
) -> LibraryItem:
    """Update the status or the progress of a library entry."""
    return await service.update(
        user.id,
        anime_id,
        status=payload.status,
        progress_episode=payload.progress_episode,
    )


@router.delete(
    "/{anime_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove an anime from the library",
)
async def delete_library_entry(
    anime_id: UUID,
    service: LibraryServiceDep,
    user: CurrentUser,
) -> Response:
    """Remove an anime from the personal library of the current user."""
    await service.delete(user.id, anime_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
