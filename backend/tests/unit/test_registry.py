"""Unit tests of the provider registry."""

from __future__ import annotations

import pytest

from anime_app.core.exceptions import NotFoundError
from anime_app.domain.providers.base import ProviderInfo, ProviderKind
from anime_app.domain.providers.registry import ProviderRegistry


class DummyProvider:
    """Minimal catalog and playback provider used by the tests."""

    display_name = "Dummy"

    def __init__(self, provider_id: str = "dummy") -> None:
        self.provider_id = provider_id

    async def search(self, query: str, *, limit: int, offset: int) -> list[object]:
        """Return no result."""
        return []

    async def get_details(self, external_id: str, *, title_hint: str | None = None) -> object:
        """Return no detail."""
        return None

    async def get_episodes(
        self, external_id: str, *, title_hint: str | None = None
    ) -> list[object]:
        """Return no episode."""
        return []

    async def get_sources(self, *args: object, **kwargs: object) -> list[object]:
        """Return no source."""
        return []

    async def get_playback_options(self, *args: object, **kwargs: object) -> list[object]:
        """Return no playback option."""
        return []


def info(provider_id: str, **kwargs: object) -> ProviderInfo:
    """Build a provider description."""
    return ProviderInfo(
        id=provider_id,
        name=provider_id.title(),
        kind=ProviderKind.CATALOG,
        **kwargs,  # type: ignore[arg-type]
    )


def test_register_makes_the_provider_available() -> None:
    """A registered provider can be retrieved."""
    registry = ProviderRegistry(["*"])
    provider = DummyProvider()
    registry.register(info("dummy"), catalog=provider, playback=provider)

    assert registry.get_catalog("dummy") is provider
    assert registry.get_playback("dummy") is provider
    assert registry.is_enabled("dummy") is True
    assert registry.get_info("dummy").name == "Dummy"


def test_register_rejects_duplicates() -> None:
    """A provider id can only be registered once."""
    registry = ProviderRegistry(["*"])
    registry.register(info("dummy"), catalog=DummyProvider())

    with pytest.raises(ValueError, match="already registered"):
        registry.register(info("dummy"), catalog=DummyProvider())


def test_allow_list_disables_unlisted_providers() -> None:
    """Providers outside of the allow list are disabled."""
    registry = ProviderRegistry(["allowed"])
    registry.register(info("allowed"), catalog=DummyProvider("allowed"))
    registry.register(info("blocked"), catalog=DummyProvider("blocked"))

    assert registry.is_enabled("allowed") is True
    assert registry.is_enabled("blocked") is False
    assert [provider.provider_id for provider in registry.catalog_providers()] == ["allowed"]


def test_wildcard_allows_every_provider() -> None:
    """The wildcard allow list enables every provider."""
    registry = ProviderRegistry(["*"])
    registry.register(info("one"), catalog=DummyProvider())
    registry.register(info("two"), catalog=DummyProvider())

    assert len(registry.catalog_providers()) == 2


def test_empty_allow_list_disables_everything() -> None:
    """An empty allow list fails closed."""
    registry = ProviderRegistry([])
    registry.register(info("one"), catalog=DummyProvider())

    assert registry.is_enabled("one") is False


def test_disabled_providers_are_not_returned() -> None:
    """A disabled provider is excluded from the provider lists."""
    registry = ProviderRegistry(["*"])
    registry.register(info("one"), catalog=DummyProvider("one"))
    registry.register(info("two"), catalog=DummyProvider("two"))
    registry.set_enabled("two", False)

    assert [provider.provider_id for provider in registry.catalog_providers()] == ["one"]


def test_set_enabled_rejects_unknown_providers() -> None:
    """Enabling an unknown provider is an error."""
    registry = ProviderRegistry(["*"])

    with pytest.raises(NotFoundError):
        registry.set_enabled("missing", True)


def test_set_enabled_rejects_providers_outside_of_the_allow_list() -> None:
    """A provider outside of the allow list cannot be enabled at runtime."""
    registry = ProviderRegistry(["allowed"])
    registry.register(info("blocked"), catalog=DummyProvider())

    with pytest.raises(ValueError, match="not allowed"):
        registry.set_enabled("blocked", True)


def test_get_catalog_raises_for_unknown_providers() -> None:
    """An unknown provider cannot be resolved."""
    registry = ProviderRegistry(["*"])

    with pytest.raises(NotFoundError):
        registry.get_catalog("missing")


def test_get_catalog_raises_for_disabled_providers() -> None:
    """A disabled provider cannot be resolved."""
    registry = ProviderRegistry(["*"])
    registry.register(info("dummy"), catalog=DummyProvider())
    registry.set_enabled("dummy", False)

    with pytest.raises(NotFoundError, match="disabled"):
        registry.get_catalog("dummy")


def test_get_playback_raises_when_the_provider_has_no_playback() -> None:
    """A catalog only provider cannot be used for playback."""
    registry = ProviderRegistry(["*"])
    registry.register(info("dummy"), catalog=DummyProvider())

    with pytest.raises(NotFoundError, match="does not provide playback"):
        registry.get_playback("dummy")


def test_describe_is_sorted() -> None:
    """The provider description is sorted by identifier."""
    registry = ProviderRegistry(["*"])
    registry.register(info("zeta"), catalog=DummyProvider())
    registry.register(info("alpha"), catalog=DummyProvider())

    assert [item.id for item in registry.describe()] == ["alpha", "zeta"]


def test_unregister_removes_the_provider() -> None:
    """A provider can be removed from the registry."""
    registry = ProviderRegistry(["*"])
    registry.register(info("dummy"), catalog=DummyProvider())
    registry.unregister("dummy")

    assert registry.is_enabled("dummy") is False
    assert registry.catalog_providers() == []


def test_supported_kinds_reports_the_usable_kinds() -> None:
    """The registry reports which kinds are usable."""
    registry = ProviderRegistry(["*"])
    registry.register(info("catalog-only"), catalog=DummyProvider())

    assert ProviderKind.CATALOG in registry.supported_kinds()
    assert ProviderKind.PLAYBACK not in registry.supported_kinds()
