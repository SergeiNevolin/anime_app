"""SQLAlchemy implementations of the domain repository ports."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import CursorResult
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from anime_app.domain.anime.entities import AnimeExternalRef, AnimeRecord, AnimeRefInput
from anime_app.domain.library.models import LibraryEntry, LibraryStatus
from anime_app.domain.user.models import User
from anime_app.infrastructure.database.models import (
    AnimeExternalRefModel,
    AnimeModel,
    UserLibraryModel,
    UserModel,
)

__all__ = [
    "SqlAlchemyAnimeRepository",
    "SqlAlchemyLibraryRepository",
    "SqlAlchemyUserRepository",
]


def _to_record(
    model: AnimeModel,
    *,
    provider: str | None = None,
    external_id: str | None = None,
    external_url: str | None = None,
) -> AnimeRecord:
    return AnimeRecord(
        id=model.id,
        canonical_title=model.canonical_title,
        title_key=model.title_key,
        poster_url=model.poster_url,
        original_title=model.original_title,
        provider=provider,
        external_id=external_id,
        external_url=external_url,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


class SqlAlchemyAnimeRepository:
    """Anime catalog storage backed by PostgreSQL."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, anime_id: UUID) -> AnimeRecord | None:
        """Return a catalog entry by its identifier."""
        model = await self._session.get(AnimeModel, anime_id)
        if model is None:
            return None
        ref = await self._primary_ref(anime_id)
        if ref is None:
            return _to_record(model)
        return _to_record(
            model,
            provider=ref.provider,
            external_id=ref.external_id,
            external_url=ref.external_url,
        )

    async def get_by_external_ref(self, provider: str, external_id: str) -> AnimeRecord | None:
        """Return a catalog entry by provider scoped external identifier."""
        statement = (
            select(AnimeExternalRefModel)
            .where(
                AnimeExternalRefModel.provider == provider,
                AnimeExternalRefModel.external_id == external_id,
            )
            .limit(1)
        )
        ref = (await self._session.execute(statement)).scalar_one_or_none()
        if ref is None:
            return None
        return await self.get(ref.anime_id)

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
        existing = await self.get_by_external_ref(provider, external_id)
        if existing is not None:
            return await self._refresh(
                existing,
                poster_url=poster_url,
                original_title=original_title,
            )

        try:
            async with self._session.begin_nested():
                model = AnimeModel(
                    id=uuid.uuid4(),
                    canonical_title=canonical_title,
                    title_key=title_key,
                    poster_url=poster_url,
                    original_title=original_title,
                )
                self._session.add(model)
                await self._session.flush()
                ref = AnimeExternalRefModel(
                    id=uuid.uuid4(),
                    anime_id=model.id,
                    provider=provider,
                    external_id=external_id,
                    external_url=external_url,
                )
                self._session.add(ref)
                await self._session.flush()
                created = _to_record(
                    model,
                    provider=provider,
                    external_id=external_id,
                    external_url=external_url,
                )
        except IntegrityError:
            # A concurrent request created the same reference first.
            existing = await self.get_by_external_ref(provider, external_id)
            if existing is None:  # pragma: no cover - defensive
                raise
            return existing
        return created

    async def list_refs(self, anime_id: UUID) -> list[AnimeExternalRef]:
        """Return every provider reference of a catalog entry."""
        statement = (
            select(AnimeExternalRefModel)
            .where(AnimeExternalRefModel.anime_id == anime_id)
            .order_by(AnimeExternalRefModel.provider)
        )
        refs = (await self._session.execute(statement)).scalars().all()
        return [
            AnimeExternalRef(
                id=ref.id,
                anime_id=ref.anime_id,
                provider=ref.provider,
                external_id=ref.external_id,
                external_url=ref.external_url,
            )
            for ref in refs
        ]

    async def get_or_create_many(
        self,
        items: list[AnimeRefInput],
    ) -> dict[tuple[str, str], AnimeRecord]:
        """Return the catalog entries of many provider entries at once."""
        if not items:
            return {}

        pairs = [(item.provider, item.external_id) for item in items]
        existing = await self._refs_for(pairs)
        missing = [item for item in items if (item.provider, item.external_id) not in existing]

        if missing:
            anime_rows = [
                {
                    "id": uuid.uuid4(),
                    "canonical_title": item.canonical_title,
                    "title_key": item.title_key,
                    "poster_url": item.poster_url,
                    "original_title": item.original_title,
                }
                for item in missing
            ]
            inserted_ids = (
                (
                    await self._session.execute(
                        pg_insert(AnimeModel).values(anime_rows).returning(AnimeModel.id)
                    )
                )
                .scalars()
                .all()
            )
            ref_rows = [
                {
                    "id": uuid.uuid4(),
                    "anime_id": anime_id,
                    "provider": item.provider,
                    "external_id": item.external_id,
                    "external_url": item.external_url,
                }
                for item, anime_id in zip(missing, inserted_ids, strict=False)
            ]
            await self._session.execute(
                pg_insert(AnimeExternalRefModel)
                .values(ref_rows)
                .on_conflict_do_nothing(index_elements=["provider", "external_id"])
            )
            await self._session.flush()
            existing = await self._refs_for(pairs)

        result: dict[tuple[str, str], AnimeRecord] = {}
        anime_ids = {ref.anime_id for ref in existing.values()}
        models: dict[UUID, AnimeModel] = {}
        if anime_ids:
            statement = select(AnimeModel).where(AnimeModel.id.in_(anime_ids))
            for model in (await self._session.execute(statement)).scalars().all():
                models[model.id] = model
        for key, ref in existing.items():
            anime_model = models.get(ref.anime_id)
            if anime_model is None:  # pragma: no cover - defensive
                continue
            result[key] = _to_record(
                anime_model,
                provider=ref.provider,
                external_id=ref.external_id,
                external_url=ref.external_url,
            )
        return result

    async def _refs_for(
        self,
        pairs: list[tuple[str, str]],
    ) -> dict[tuple[str, str], AnimeExternalRefModel]:
        """Return the existing references for the given provider pairs."""
        if not pairs:
            return {}
        providers = {provider for provider, _ in pairs}
        external_ids = {external_id for _, external_id in pairs}
        statement = select(AnimeExternalRefModel).where(
            AnimeExternalRefModel.provider.in_(providers),
            AnimeExternalRefModel.external_id.in_(external_ids),
        )
        refs = (await self._session.execute(statement)).scalars().all()
        wanted = set(pairs)
        return {
            (ref.provider, ref.external_id): ref
            for ref in refs
            if (ref.provider, ref.external_id) in wanted
        }

    async def list_by_title_key(self, title_key: str) -> list[AnimeRecord]:
        """Return every catalog entry sharing the given normalized title."""
        statement = (
            select(AnimeModel)
            .where(AnimeModel.title_key == title_key)
            .order_by(AnimeModel.created_at)
        )
        models = (await self._session.execute(statement)).scalars().all()
        records: list[AnimeRecord] = []
        for model in models:
            ref = await self._primary_ref(model.id)
            if ref is None:
                records.append(_to_record(model))
            else:
                records.append(
                    _to_record(
                        model,
                        provider=ref.provider,
                        external_id=ref.external_id,
                        external_url=ref.external_url,
                    )
                )
        return records

    async def find_siblings(self, anime_id: UUID) -> list[AnimeRecord]:
        """Return other catalog entries that represent the same title."""
        model = await self._session.get(AnimeModel, anime_id)
        if model is None:
            return []
        siblings = await self.list_by_title_key(model.title_key)
        return [record for record in siblings if record.id != anime_id]

    async def _primary_ref(self, anime_id: UUID) -> AnimeExternalRefModel | None:
        statement = (
            select(AnimeExternalRefModel)
            .where(AnimeExternalRefModel.anime_id == anime_id)
            .order_by(AnimeExternalRefModel.created_at)
            .limit(1)
        )
        return (await self._session.execute(statement)).scalar_one_or_none()

    async def _refresh(
        self,
        record: AnimeRecord,
        *,
        poster_url: str | None,
        original_title: str | None,
    ) -> AnimeRecord:
        """Complete the missing metadata of a catalogue entry."""
        model = await self._session.get(AnimeModel, record.id)
        if model is None:  # pragma: no cover - defensive
            return record
        changed = False
        if not model.poster_url and poster_url:
            model.poster_url = poster_url
            record.poster_url = poster_url
            changed = True
        if not model.original_title and original_title:
            model.original_title = original_title
            record.original_title = original_title
            changed = True
        if changed:
            model.updated_at = datetime.now(UTC)
            await self._session.flush()
        return record


class SqlAlchemyUserRepository:
    """User storage backed by PostgreSQL."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_telegram_id(self, telegram_id: int) -> User | None:
        """Return the user with the given Telegram identifier."""
        statement = select(UserModel).where(UserModel.telegram_id == telegram_id).limit(1)
        model = (await self._session.execute(statement)).scalar_one_or_none()
        return self._to_domain(model) if model else None

    async def get_or_create(
        self,
        *,
        telegram_id: int,
        username: str | None = None,
        first_name: str | None = None,
        language_code: str | None = None,
    ) -> User:
        """Return the user, creating it on the first request."""
        statement = select(UserModel).where(UserModel.telegram_id == telegram_id).limit(1)
        model = (await self._session.execute(statement)).scalar_one_or_none()
        if model is None:
            try:
                async with self._session.begin_nested():
                    model = UserModel(
                        id=uuid.uuid4(),
                        telegram_id=telegram_id,
                        username=username,
                        first_name=first_name,
                        language_code=language_code,
                    )
                    self._session.add(model)
                    await self._session.flush()
            except IntegrityError:
                statement = select(UserModel).where(UserModel.telegram_id == telegram_id).limit(1)
                model = (await self._session.execute(statement)).scalar_one_or_none()
                if model is None:  # pragma: no cover - defensive
                    raise
        else:
            changed = False
            if username and model.username != username:
                model.username = username
                changed = True
            if first_name and model.first_name != first_name:
                model.first_name = first_name
                changed = True
            if language_code and model.language_code != language_code:
                model.language_code = language_code
                changed = True
            if changed:
                await self._session.flush()
        if model is None:  # pragma: no cover - defensive
            raise RuntimeError("the user could not be created")
        return self._to_domain(model)

    async def touch(self, user_id: object) -> None:
        """Update the ``last_seen_at`` timestamp of a user."""
        statement = select(UserModel).where(UserModel.id == user_id).limit(1)
        model = (await self._session.execute(statement)).scalar_one_or_none()
        if model is None:
            return
        model.last_seen_at = datetime.now(UTC)
        await self._session.flush()

    @staticmethod
    def _to_domain(model: UserModel) -> User:
        return User(
            id=model.id,
            telegram_id=model.telegram_id,
            username=model.username,
            first_name=model.first_name,
            language_code=model.language_code,
            created_at=model.created_at,
            updated_at=model.updated_at,
            last_seen_at=model.last_seen_at,
        )


class SqlAlchemyLibraryRepository:
    """Personal library storage backed by PostgreSQL."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_entries(
        self,
        user_id: UUID,
        *,
        status: LibraryStatus | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Sequence[LibraryEntry]:
        """Return the library entries of a user."""
        statement = select(UserLibraryModel).where(UserLibraryModel.user_id == user_id)
        if status is not None:
            statement = statement.where(UserLibraryModel.status == status.value)
        statement = (
            statement.order_by(UserLibraryModel.updated_at.desc(), UserLibraryModel.anime_id)
            .limit(limit)
            .offset(offset)
        )
        models = (await self._session.execute(statement)).scalars().all()
        return [self._to_domain(model) for model in models]

    async def count(self, user_id: UUID, *, status: LibraryStatus | None = None) -> int:
        """Return the number of library entries of a user."""
        statement = (
            select(func.count())
            .select_from(UserLibraryModel)
            .where(UserLibraryModel.user_id == user_id)
        )
        if status is not None:
            statement = statement.where(UserLibraryModel.status == status.value)
        return int((await self._session.execute(statement)).scalar_one())

    async def get(self, user_id: UUID, anime_id: UUID) -> LibraryEntry | None:
        """Return a single library entry."""
        statement = (
            select(UserLibraryModel)
            .where(
                UserLibraryModel.user_id == user_id,
                UserLibraryModel.anime_id == anime_id,
            )
            .limit(1)
        )
        model = (await self._session.execute(statement)).scalar_one_or_none()
        return self._to_domain(model) if model else None

    async def upsert(
        self,
        *,
        user_id: UUID,
        anime_id: UUID,
        status: LibraryStatus,
        progress_episode: int,
    ) -> LibraryEntry:
        """Create or update a library entry."""
        statement = (
            select(UserLibraryModel)
            .where(
                UserLibraryModel.user_id == user_id,
                UserLibraryModel.anime_id == anime_id,
            )
            .limit(1)
        )
        model = (await self._session.execute(statement)).scalar_one_or_none()
        if model is None:
            try:
                async with self._session.begin_nested():
                    model = UserLibraryModel(
                        id=uuid.uuid4(),
                        user_id=user_id,
                        anime_id=anime_id,
                        status=status.value,
                        progress_episode=progress_episode,
                    )
                    self._session.add(model)
                    await self._session.flush()
            except IntegrityError:
                statement = (
                    select(UserLibraryModel)
                    .where(
                        UserLibraryModel.user_id == user_id,
                        UserLibraryModel.anime_id == anime_id,
                    )
                    .limit(1)
                )
                model = (await self._session.execute(statement)).scalar_one_or_none()
                if model is None:  # pragma: no cover - defensive
                    raise
        else:
            model.status = status.value
            model.progress_episode = progress_episode
            model.updated_at = datetime.now(UTC)
            await self._session.flush()
        if model is None:  # pragma: no cover - defensive
            raise RuntimeError("the library entry could not be created")
        return self._to_domain(model)

    async def delete(self, user_id: UUID, anime_id: UUID) -> bool:
        """Delete a library entry, returning whether it existed."""
        statement = delete(UserLibraryModel).where(
            UserLibraryModel.user_id == user_id,
            UserLibraryModel.anime_id == anime_id,
        )
        result = await self._session.execute(statement)
        await self._session.flush()
        return bool(cast("CursorResult[Any]", result).rowcount)

    async def list_watching(self, user_id: UUID, *, limit: int = 10) -> Sequence[LibraryEntry]:
        """Return the entries with recorded progress, most recent first."""
        statement = (
            select(UserLibraryModel)
            .where(
                UserLibraryModel.user_id == user_id,
                UserLibraryModel.progress_episode > 0,
            )
            .order_by(UserLibraryModel.updated_at.desc())
            .limit(limit)
        )
        models = (await self._session.execute(statement)).scalars().all()
        return [self._to_domain(model) for model in models]

    @staticmethod
    def _to_domain(model: UserLibraryModel) -> LibraryEntry:
        return LibraryEntry(
            id=model.id,
            user_id=model.user_id,
            anime_id=model.anime_id,
            status=LibraryStatus(model.status),
            progress_episode=model.progress_episode,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
