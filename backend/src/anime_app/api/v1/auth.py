"""Authentication endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from anime_app.api.dependencies import CurrentUser
from anime_app.domain.user.models import User

__all__ = ["router"]

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=User, summary="Return the authenticated user")
async def read_current_user(user: CurrentUser) -> User:
    """Return the profile of the authenticated Telegram user."""
    return user
