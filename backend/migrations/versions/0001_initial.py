"""Initial schema of the Anime Watch API.

Revision ID: 0001_initial
Revises:
Create Date: 2026-01-01 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the initial schema."""
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("username", sa.String(length=64), nullable=True),
        sa.Column("first_name", sa.String(length=128), nullable=True),
        sa.Column("language_code", sa.String(length=16), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("telegram_id", name=op.f("uq_users_telegram_id")),
    )
    op.create_index(op.f("ix_users_last_seen_at"), "users", ["last_seen_at"])

    op.create_table(
        "anime",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("canonical_title", sa.String(length=512), nullable=False),
        sa.Column("title_key", sa.String(length=512), nullable=False),
        sa.Column("poster_url", sa.String(length=1024), nullable=True),
        sa.Column("original_title", sa.String(length=512), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_anime")),
    )
    op.create_index(op.f("ix_anime_canonical_title"), "anime", ["canonical_title"])
    op.create_index(op.f("ix_anime_title_key"), "anime", ["title_key"])

    op.create_table(
        "anime_external_refs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("anime_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("external_id", sa.String(length=512), nullable=False),
        sa.Column("external_url", sa.String(length=1024), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["anime_id"],
            ["anime.id"],
            name=op.f("fk_anime_external_refs_anime_id_anime"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_anime_external_refs")),
        sa.UniqueConstraint(
            "provider",
            "external_id",
            name="uq_anime_external_refs_provider_external",
        ),
    )
    op.create_index(
        op.f("ix_anime_external_refs_anime_id"),
        "anime_external_refs",
        ["anime_id"],
    )

    op.create_table(
        "user_library",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("anime_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("progress_episode", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "progress_episode >= 0",
            name="ck_user_library_progress_episode",
        ),
        sa.ForeignKeyConstraint(
            ["anime_id"],
            ["anime.id"],
            name=op.f("fk_user_library_anime_id_anime"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_user_library_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_library")),
        sa.UniqueConstraint("user_id", "anime_id", name="uq_user_library_user_anime"),
    )
    op.create_index(op.f("ix_user_library_anime_id"), "user_library", ["anime_id"])
    op.create_index(op.f("ix_user_library_user_id"), "user_library", ["user_id"])
    op.create_index(
        op.f("ix_user_library_user_id_status"),
        "user_library",
        ["user_id", "status"],
    )


def downgrade() -> None:
    """Drop the initial schema."""
    op.drop_index(op.f("ix_user_library_user_id_status"), table_name="user_library")
    op.drop_index(op.f("ix_user_library_user_id"), table_name="user_library")
    op.drop_index(op.f("ix_user_library_anime_id"), table_name="user_library")
    op.drop_table("user_library")
    op.drop_index(op.f("ix_anime_external_refs_anime_id"), table_name="anime_external_refs")
    op.drop_table("anime_external_refs")
    op.drop_index(op.f("ix_anime_title_key"), table_name="anime")
    op.drop_index(op.f("ix_anime_canonical_title"), table_name="anime")
    op.drop_table("anime")
    op.drop_index(op.f("ix_users_last_seen_at"), table_name="users")
    op.drop_table("users")
