"""User domain model."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

__all__ = ["GUEST_TELEGRAM_ID", "AuthenticatedIdentity", "User"]

#: Telegram identifier of the account used when the request carries no
#: usable credentials.  Telegram identifiers are always positive, so the zero
#: can never collide with a real user.
#: TODO: remove the guest account, see ``api/dependencies.py:get_current_user``.
GUEST_TELEGRAM_ID = 0


@dataclass(frozen=True, slots=True)
class AuthenticatedIdentity:
    """Identity extracted from a credential."""

    telegram_id: int
    username: str | None = None
    first_name: str | None = None
    language_code: str | None = None
    is_development: bool = False


class User(BaseModel):
    """A Telegram user of the Mini App."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    telegram_id: int
    username: str | None = None
    first_name: str | None = None
    language_code: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_seen_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
