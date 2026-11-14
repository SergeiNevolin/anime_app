"""Integration tests of the composition root and of the error handling."""

from __future__ import annotations

import pytest

from anime_app.config import Settings
from anime_app.container import build_container
from anime_app.infrastructure.cache.base import NullCache
from anime_app.infrastructure.cache.redis_cache import RedisCache
from anime_app.infrastructure.telegram.auth import DevAuthProvider, TelegramAuthProvider

pytestmark = pytest.mark.integration


async def test_the_container_registers_the_providers() -> None:
    """Every known provider is registered in the registry."""
    settings = Settings(
        app_env="test",
        allowed_providers=["*"],
        telegram_bot_token="123456789:AAHtestTokenForUnitTestsOnly0000000000",
        redis_url="redis://127.0.0.1:6399/15",
    )

    container = await build_container(settings)
    try:
        providers = container.registry.describe()
        assert {info.id for info in providers} >= {"aniliberty", "yummy_anime"}
        assert all(info.enabled for info in providers)
    finally:
        await container.aclose()


async def test_the_allow_list_is_applied() -> None:
    """The providers outside of the allow list are disabled."""
    settings = Settings(
        app_env="test",
        allowed_providers=["aniliberty"],
        telegram_bot_token="123456789:AAHtestTokenForUnitTestsOnly0000000000",
        redis_url="redis://127.0.0.1:6399/15",
    )

    container = await build_container(settings)
    try:
        assert container.registry.is_enabled("aniliberty") is True
        assert container.registry.is_enabled("animevost") is False
    finally:
        await container.aclose()


async def test_the_cache_degrades_when_redis_is_unreachable() -> None:
    """The application starts even when Redis is down."""
    settings = Settings(
        app_env="test",
        telegram_bot_token="123456789:AAHtestTokenForUnitTestsOnly0000000000",
        redis_url="redis://127.0.0.1:6399/15",
    )

    container = await build_container(settings)
    try:
        assert isinstance(container.cache, NullCache)
    finally:
        await container.aclose()


async def test_the_cache_is_used_when_redis_is_available() -> None:
    """The Redis cache is used when the server answers."""
    from tests.conftest import TEST_REDIS_URL

    settings = Settings(
        app_env="test",
        telegram_bot_token="123456789:AAHtestTokenForUnitTestsOnly0000000000",
        redis_url=TEST_REDIS_URL,
    )

    container = await build_container(settings)
    try:
        if not await container.cache.ping():
            pytest.skip("the Redis test instance is not reachable")
        assert isinstance(container.cache, RedisCache)
    finally:
        await container.aclose()


async def test_the_authentication_providers_are_built() -> None:
    """The Telegram provider is created when a bot token is configured."""
    settings = Settings(
        app_env="test",
        telegram_bot_token="123456789:AAHtestTokenForUnitTestsOnly0000000000",
        redis_url="redis://127.0.0.1:6399/15",
    )

    container = await build_container(settings)
    try:
        schemes = {provider.scheme for provider in container.auth_providers}
        assert "tma" in schemes
        assert "dev" not in schemes
    finally:
        await container.aclose()


async def test_the_development_provider_is_disabled_in_production() -> None:
    """The development provider is never registered in production."""
    settings = Settings(
        app_env="production",
        dev_auth_enabled=True,
        telegram_bot_token="123456789:AAHtestTokenForUnitTestsOnly0000000000",
        redis_url="redis://127.0.0.1:6399/15",
    )

    container = await build_container(settings)
    try:
        schemes = {provider.scheme for provider in container.auth_providers}
        assert "dev" not in schemes
    finally:
        await container.aclose()


async def test_the_development_provider_is_available_in_development() -> None:
    """The development provider is registered when it is enabled."""
    settings = Settings(
        app_env="development",
        dev_auth_enabled=True,
        telegram_bot_token="123456789:AAHtestTokenForUnitTestsOnly0000000000",
        redis_url="redis://127.0.0.1:6399/15",
    )

    container = await build_container(settings)
    try:
        providers = {provider.scheme: provider for provider in container.auth_providers}
        assert isinstance(providers["dev"], DevAuthProvider)
        assert isinstance(providers["tma"], TelegramAuthProvider)
    finally:
        await container.aclose()


async def test_an_unexpected_error_returns_the_error_envelope(client) -> None:
    """An unexpected error never leaks the stack trace."""
    response = await client.get("/__test__/boom")

    assert response.status_code == 500
    payload = response.json()
    assert payload["error"]["code"] == "INTERNAL_ERROR"
    assert "RuntimeError" not in response.text
    assert payload["error"]["request_id"]


async def test_an_unknown_route_returns_the_error_envelope(client) -> None:
    """An unknown route uses the unified error format."""
    response = await client.get("/api/v1/unknown")

    assert response.status_code == 404
    payload = response.json()
    assert payload["error"]["code"] == "NOT_FOUND"
    assert payload["error"]["request_id"]
