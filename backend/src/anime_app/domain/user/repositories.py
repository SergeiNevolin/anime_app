"""Persistence ports for users."""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from anime_app.domain.user.models import User

__all__ = ["UserRepository"]


@runtime_checkable
class UserRepository(Protocol):
    """Storage operations for Telegram users."""

    async def get_by_telegram_id(self, telegram_id: int) -> User | None:
        """Return the user with the given Telegram identifier."""
        ...

    async def get_or_create(
        self,
        *,
        telegram_id: int,
        username: str | None = None,
        first_name: str | None = None,
        language_code: str | None = None,
    ) -> User:
        """Return the user, creating it on the first request."""
        ...

    async def touch(self, user_id: object) -> None:
        """Update the ``last_seen_at`` timestamp of a user."""
        ...
