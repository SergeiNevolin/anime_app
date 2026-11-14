"""SQLAlchemy ORM models.

The ORM models are an infrastructure detail: the application layer only sees
the domain entities defined in :mod:`anime_app.domain`.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any, ClassVar

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

__all__ = [
    "AnimeExternalRefModel",
    "AnimeModel",
    "Base",
    "UserLibraryModel",
    "UserModel",
]


def _new_uuid() -> uuid.UUID:
    return uuid.uuid4()


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    """Declarative base class."""

    type_annotation_map: ClassVar[dict[Any, Any]] = {dict[str, Any]: JSONB}

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        """Return a readable representation of the row."""
        columns = ", ".join(
            f"{column.name}={getattr(self, column.name)!r}" for column in self.__table__.columns
        )
        return f"{type(self).__name__}({columns})"


class UserModel(Base):
    """Telegram user of the Mini App."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_new_uuid)
    telegram_id: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True)
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    language_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
        server_default=func.now(),
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default=func.now()
    )

    library_entries: Mapped[list[UserLibraryModel]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (Index("ix_users_last_seen_at", "last_seen_at"),)


class AnimeModel(Base):
    """Canonical catalog entry."""

    __tablename__ = "anime"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_new_uuid)
    canonical_title: Mapped[str] = mapped_column(String(512), nullable=False)
    title_key: Mapped[str] = mapped_column(String(512), nullable=False)
    poster_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    original_title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
        server_default=func.now(),
    )

    external_refs: Mapped[list[AnimeExternalRefModel]] = relationship(
        back_populates="anime", cascade="all, delete-orphan", lazy="selectin"
    )
    library_entries: Mapped[list[UserLibraryModel]] = relationship(
        back_populates="anime", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        Index("ix_anime_title_key", "title_key"),
        Index("ix_anime_canonical_title", "canonical_title"),
    )


class AnimeExternalRefModel(Base):
    """Reference from a catalog entry to an external provider entry."""

    __tablename__ = "anime_external_refs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_new_uuid)
    anime_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("anime.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    external_id: Mapped[str] = mapped_column(String(512), nullable=False)
    external_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default=func.now()
    )

    anime: Mapped[AnimeModel] = relationship(back_populates="external_refs")

    __table_args__ = (
        UniqueConstraint(
            "provider",
            "external_id",
            name="uq_anime_external_refs_provider_external",
        ),
        Index("ix_anime_external_refs_anime_id", "anime_id"),
    )


class UserLibraryModel(Base):
    """Entry of the personal library."""

    __tablename__ = "user_library"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_new_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    anime_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("anime.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    progress_episode: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
        server_default=func.now(),
    )

    user: Mapped[UserModel] = relationship(back_populates="library_entries")
    anime: Mapped[AnimeModel] = relationship(back_populates="library_entries")

    __table_args__ = (
        UniqueConstraint("user_id", "anime_id", name="uq_user_library_user_anime"),
        CheckConstraint("progress_episode >= 0", name="ck_user_library_progress_episode"),
        Index("ix_user_library_user_id", "user_id"),
        Index("ix_user_library_anime_id", "anime_id"),
        Index("ix_user_library_user_id_status", "user_id", "status"),
    )
