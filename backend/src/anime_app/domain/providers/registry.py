"""Registry of the available content providers.

The registry is the only place that knows which providers exist, whether they
are enabled and which allow-list rules apply.  Application services ask the
registry for "every enabled catalog provider" instead of importing concrete
adapters, which keeps the business logic independent of the integration layer.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence

from anime_app.core.exceptions import NotFoundError
from anime_app.domain.providers.base import (
    AnimeCatalogProvider,
    PlaybackProvider,
    ProviderInfo,
    ProviderKind,
)

__all__ = ["ProviderRegistry"]

WILDCARD = "*"


class ProviderRegistry:
    """Holds the registered providers and applies the allow-list rules."""

    def __init__(self, allowed_providers: Sequence[str] | None = None) -> None:
        """Create a registry.

        Args:
            allowed_providers: Allow-list of provider identifiers.  ``["*"]``
                enables every provider.  An empty list disables everything.
        """
        self._allowed = {item.strip().lower() for item in (allowed_providers or []) if item.strip()}
        self._infos: dict[str, ProviderInfo] = {}
        self._catalog: dict[str, AnimeCatalogProvider] = {}
        self._playback: dict[str, PlaybackProvider] = {}

    # -- registration ----------------------------------------------------

    def register(
        self,
        info: ProviderInfo,
        *,
        catalog: AnimeCatalogProvider | None = None,
        playback: PlaybackProvider | None = None,
    ) -> None:
        """Register a provider.

        Args:
            info: Descriptive information about the provider.
            catalog: Catalog implementation, when the provider exposes one.
            playback: Playback implementation, when the provider exposes one.

        Raises:
            ValueError: if the provider id is already registered.
        """
        if info.id in self._infos:
            raise ValueError(f"provider {info.id!r} is already registered")
        effective = info.model_copy(update={"enabled": info.enabled and self.is_allowed(info.id)})
        self._infos[info.id] = effective
        if catalog is not None:
            self._catalog[info.id] = catalog
        if playback is not None:
            self._playback[info.id] = playback

    def unregister(self, provider_id: str) -> None:
        """Remove a provider from the registry."""
        self._infos.pop(provider_id, None)
        self._catalog.pop(provider_id, None)
        self._playback.pop(provider_id, None)

    # -- allow list ------------------------------------------------------

    def is_allowed(self, provider_id: str) -> bool:
        """Return whether ``provider_id`` passes the configured allow-list."""
        if WILDCARD in self._allowed:
            return True
        return provider_id.lower() in self._allowed

    def set_enabled(self, provider_id: str, enabled: bool) -> None:
        """Enable or disable a registered provider at runtime."""
        info = self._infos.get(provider_id)
        if info is None:
            raise NotFoundError(f"unknown provider: {provider_id}")
        if enabled and not self.is_allowed(provider_id):
            raise ValueError(f"provider {provider_id!r} is not allowed by configuration")
        self._infos[provider_id] = info.model_copy(update={"enabled": enabled})

    # -- lookup ----------------------------------------------------------

    def is_enabled(self, provider_id: str) -> bool:
        """Return whether the provider is registered and enabled."""
        info = self._infos.get(provider_id)
        return bool(info and info.enabled)

    def get_info(self, provider_id: str) -> ProviderInfo:
        """Return the description of a provider.

        Raises:
            NotFoundError: if the provider is unknown.
        """
        info = self._infos.get(provider_id)
        if info is None:
            raise NotFoundError(f"unknown provider: {provider_id}")
        return info

    def describe(self) -> list[ProviderInfo]:
        """Return the description of every registered provider."""
        return sorted(self._infos.values(), key=lambda item: item.id)

    def catalog_providers(self) -> list[AnimeCatalogProvider]:
        """Return every enabled catalog provider."""
        return [
            provider
            for provider_id, provider in self._catalog.items()
            if self.is_enabled(provider_id)
        ]

    def playback_providers(self) -> list[PlaybackProvider]:
        """Return every enabled playback provider."""
        return [
            provider
            for provider_id, provider in self._playback.items()
            if self.is_enabled(provider_id)
        ]

    def get_catalog(self, provider_id: str) -> AnimeCatalogProvider:
        """Return an enabled catalog provider.

        Raises:
            NotFoundError: if the provider is unknown or does not expose a
                catalog implementation.
        """
        provider = self._catalog.get(provider_id)
        if provider is None:
            raise NotFoundError(f"provider {provider_id!r} does not provide a catalog")
        if not self.is_enabled(provider_id):
            raise NotFoundError(f"provider {provider_id!r} is disabled")
        return provider

    def get_playback(self, provider_id: str) -> PlaybackProvider:
        """Return an enabled playback provider.

        Raises:
            NotFoundError: if the provider is unknown or does not expose a
                playback implementation.
        """
        provider = self._playback.get(provider_id)
        if provider is None:
            raise NotFoundError(f"provider {provider_id!r} does not provide playback")
        if not self.is_enabled(provider_id):
            raise NotFoundError(f"provider {provider_id!r} is disabled")
        return provider

    def supported_kinds(self) -> Iterable[ProviderKind]:
        """Return the provider kinds that are currently usable."""
        kinds: set[ProviderKind] = set()
        for provider_id in self._catalog:
            if self.is_enabled(provider_id):
                kinds.add(ProviderKind.CATALOG)
        for provider_id in self._playback:
            if self.is_enabled(provider_id):
                kinds.add(ProviderKind.PLAYBACK)
        return kinds
