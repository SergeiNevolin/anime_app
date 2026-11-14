"""Anime catalogue use cases.

The service orchestrates the catalog providers, the local catalogue and the
cache.  It never talks to an external library directly and it never fails the
whole request because a single provider is unavailable.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import UUID

from anime_app.core.exceptions import NotFoundError, ProviderError, ValidationError
from anime_app.core.logging import get_logger
from anime_app.core.pagination import Page, PageParams
from anime_app.domain.anime.entities import AnimeRefInput, AnimeRepository
from anime_app.domain.anime.models import AnimeDetails, AnimeSummary, normalize_title
from anime_app.domain.episode.models import AnimeEpisode
from anime_app.domain.providers.base import ProviderInfo
from anime_app.domain.providers.registry import ProviderRegistry
from anime_app.infrastructure.cache.base import Cache

__all__ = ["AnimeService", "build_summary_from_record"]

logger = get_logger(__name__)

MIN_QUERY_LENGTH = 2
MAX_QUERY_LENGTH = 128


class AnimeService:
    """Search, catalogue and episode use cases."""

    def __init__(
        self,
        registry: ProviderRegistry,
        anime_repository: AnimeRepository,
        cache: Cache,
        *,
        search_limit: int = 30,
        cache_ttl_search: int = 60,
        cache_ttl_details: int = 300,
        cache_ttl_episodes: int = 300,
    ) -> None:
        """Create the service.

        Args:
            registry: The provider registry.
            anime_repository: Storage of the local catalogue.
            cache: Cache used for the search, details and episode payloads.
            search_limit: Maximum number of items requested per provider.
            cache_ttl_search: TTL of the search cache in seconds.
            cache_ttl_details: TTL of the details cache in seconds.
            cache_ttl_episodes: TTL of the episode cache in seconds.
        """
        self._registry = registry
        self._anime = anime_repository
        self._cache = cache
        self._search_limit = search_limit
        self._cache_ttl_search = cache_ttl_search
        self._cache_ttl_details = cache_ttl_details
        self._cache_ttl_episodes = cache_ttl_episodes

    # -- providers --------------------------------------------------------

    def list_providers(self) -> list[ProviderInfo]:
        """Return the description of every registered provider."""
        return self._registry.describe()

    # -- search -----------------------------------------------------------

    async def search(self, query: str, params: PageParams) -> Page[AnimeSummary]:
        """Search for anime across every enabled catalog provider.

        Args:
            query: The search term.
            params: Pagination parameters.

        Returns:
            A page of search results.

        Raises:
            ValidationError: if the query is too short or too long.
        """
        cleaned = query.strip()
        if len(cleaned) < MIN_QUERY_LENGTH:
            raise ValidationError(f"the query must contain at least {MIN_QUERY_LENGTH} characters")
        if len(cleaned) > MAX_QUERY_LENGTH:
            raise ValidationError(f"the query must not exceed {MAX_QUERY_LENGTH} characters")

        cache_key = f"search:{normalize_title(cleaned)}:{params.page}:{params.page_size}"
        cached = await self._cache.get(cache_key)
        if cached:
            try:
                payload = json.loads(cached)
            except json.JSONDecodeError:  # pragma: no cover - defensive
                payload = None
            if payload is not None:
                return Page[AnimeSummary](
                    items=[AnimeSummary.model_validate(item) for item in payload["items"]],
                    page=payload["page"],
                    page_size=payload["page_size"],
                    total=payload.get("total"),
                )

        wanted = min(params.offset + params.page_size, self._search_limit)
        results = await self._search_all(cleaned, wanted)

        merged = self._merge(results)
        window = merged[params.offset : params.offset + params.page_size]
        items = await self._attach_catalogue_ids(window)

        payload = {
            "items": [item.model_dump(mode="json") for item in items],
            "page": params.page,
            "page_size": params.page_size,
            "total": None,
        }
        await self._cache.set(
            cache_key,
            json.dumps(payload, ensure_ascii=False),
            ttl=self._cache_ttl_search,
        )
        return Page[AnimeSummary](
            items=items,
            page=params.page,
            page_size=params.page_size,
            total=None,
        )

    async def _search_all(self, query: str, limit: int) -> list[AnimeSummary]:
        """Query every enabled provider in parallel and collect the results."""
        providers = self._registry.catalog_providers()
        if not providers:
            return []
        outcomes = await asyncio.gather(
            *(provider.search(query, limit=limit, offset=0) for provider in providers),
            return_exceptions=True,
        )
        collected: list[AnimeSummary] = []
        for provider, outcome in zip(providers, outcomes, strict=True):
            if isinstance(outcome, BaseException):
                logger.warning(
                    "provider %s failed during search: %s",
                    getattr(provider, "provider_id", "unknown"),
                    outcome,
                )
                continue
            collected.extend(outcome)
        return collected

    @staticmethod
    def _merge(items: list[AnimeSummary]) -> list[AnimeSummary]:
        """Merge the results of several providers, removing duplicates."""
        merged: list[AnimeSummary] = []
        seen: set[str] = set()
        for item in items:
            key = item.title_key
            if key in seen:
                continue
            seen.add(key)
            merged.append(item)
        return merged

    async def _attach_catalogue_ids(self, items: list[AnimeSummary]) -> list[AnimeSummary]:
        """Persist the search results in the local catalogue and link them."""
        if not items:
            return []
        refs = [
            AnimeRefInput(
                provider=item.provider,
                external_id=item.external_id,
                canonical_title=item.title,
                title_key=item.title_key,
                poster_url=item.poster_url,
                original_title=item.original_title,
                external_url=item.external_url,
            )
            for item in items
        ]
        try:
            records = await self._anime.get_or_create_many(refs)
        except Exception:
            logger.exception("failed to persist the search results")
            return items
        for item in items:
            record = records.get((item.provider, item.external_id))
            if record is not None:
                item.anime_id = record.id
        return items

    # -- details ----------------------------------------------------------

    async def get_details(self, anime_id: UUID) -> AnimeDetails:
        """Return the details of a catalog entry.

        Raises:
            NotFoundError: if the catalog entry does not exist.
        """
        record = await self._anime.get(anime_id)
        if record is None:
            raise NotFoundError("anime not found")
        if not record.provider or not record.external_id:
            raise NotFoundError("anime has no provider reference")

        cache_key = f"details:{anime_id}"
        cached = await self._cache.get(cache_key)
        if cached:
            try:
                return AnimeDetails.model_validate(json.loads(cached))
            except (json.JSONDecodeError, ValueError):  # pragma: no cover - defensive
                pass

        provider = self._registry.get_catalog(record.provider)
        try:
            details = await provider.get_details(
                record.external_id,
                title_hint=record.canonical_title,
            )
        except ProviderError:
            logger.warning("provider %s failed to load the details", record.provider)
            details = self._fallback_details(record)
        details.anime_id = record.id
        details.provider = record.provider
        details.external_id = record.external_id
        if not details.title:
            details.title = record.canonical_title
        if not details.poster_url:
            details.poster_url = record.poster_url
        if not details.original_title:
            details.original_title = record.original_title
        details.available_providers = await self._available_providers(record)

        await self._cache.set(
            cache_key,
            details.model_dump_json(),
            ttl=self._cache_ttl_details,
        )
        return details

    @staticmethod
    def _fallback_details(record: Any) -> AnimeDetails:
        """Build a minimal details payload from the local catalogue."""
        return AnimeDetails(
            provider=record.provider or "",
            external_id=record.external_id or "",
            title=record.canonical_title,
            original_title=record.original_title,
            poster_url=record.poster_url,
            genres=[],
        )

    async def _available_providers(self, record: Any) -> list[str]:
        """Return the providers that offer the same title."""
        providers = {record.provider} if record.provider else set()
        try:
            siblings = await self._anime.find_siblings(record.id)
        except Exception:
            logger.exception("failed to look up the sibling providers")
            return sorted(provider for provider in providers if provider)
        for sibling in siblings:
            if sibling.provider:
                providers.add(sibling.provider)
        return sorted(providers)

    # -- episodes ---------------------------------------------------------

    async def get_episodes(self, anime_id: UUID, params: PageParams) -> Page[AnimeEpisode]:
        """Return the episodes of a catalog entry.

        Raises:
            NotFoundError: if the catalog entry does not exist.
        """
        record = await self._anime.get(anime_id)
        if record is None:
            raise NotFoundError("anime not found")
        if not record.provider or not record.external_id:
            raise NotFoundError("anime has no provider reference")

        cache_key = f"episodes:{anime_id}"
        cached = await self._cache.get(cache_key)
        episodes: list[AnimeEpisode] | None = None
        if cached:
            try:
                episodes = [
                    AnimeEpisode.model_validate(item) for item in json.loads(cached)["items"]
                ]
            except (json.JSONDecodeError, KeyError, ValueError):  # pragma: no cover - defensive
                episodes = None

        if episodes is None:
            provider = self._registry.get_catalog(record.provider)
            raw_episodes = await provider.get_episodes(
                record.external_id,
                title_hint=record.canonical_title,
            )
            episodes = [
                AnimeEpisode(
                    provider=record.provider,
                    anime_external_id=record.external_id,
                    external_id=episode.external_id,
                    number=episode.number,
                    title=episode.title,
                    is_available=episode.is_available,
                )
                for episode in raw_episodes
            ]
            await self._cache.set(
                cache_key,
                json.dumps(
                    {"items": [episode.model_dump(mode="json") for episode in episodes]},
                    ensure_ascii=False,
                ),
                ttl=self._cache_ttl_episodes,
            )

        window = episodes[params.offset : params.offset + params.page_size]
        return Page[AnimeEpisode](
            items=window,
            page=params.page,
            page_size=params.page_size,
            total=len(episodes),
        )


def build_summary_from_record(record: Any) -> AnimeSummary:
    """Build a summary from a persisted catalogue record."""
    return AnimeSummary(
        provider=record.provider or "",
        external_id=record.external_id or "",
        title=record.canonical_title,
        original_title=record.original_title,
        poster_url=record.poster_url,
        genres=[],
        anime_id=record.id,
    )
