"""Shared fixtures of the test suite."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from httpx import ASGITransport

from anime_app.config import Settings
from anime_app.container import AppContainer
from anime_app.core.security.telegram import InitDataValidator
from anime_app.domain.providers.registry import ProviderRegistry
from anime_app.infrastructure.cache.base import Cache
from anime_app.infrastructure.telegram.auth import DevAuthProvider, TelegramAuthProvider
from anime_app.main import create_app

TEST_BOT_TOKEN = "123456789:AAHtestTokenForUnitTestsOnly0000000000"
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://anime:anime@localhost:5432/anime_test",
)
TEST_REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://localhost:6379/15")


class MemoryCache(Cache):
    """A deterministic in-memory cache used by the tests."""

    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.counters: dict[str, int] = {}
        self.fail = False

    async def get(self, key: str) -> str | None:
        if self.fail:
            return None
        return self.values.get(key)

    async def set(self, key: str, value: str, *, ttl: int) -> None:
        if self.fail:
            return
        self.values[key] = value

    async def delete(self, key: str) -> None:
        self.values.pop(key, None)

    async def increment(self, key: str, *, ttl: int) -> int:
        if self.fail:
            return 0
        self.counters[key] = self.counters.get(key, 0) + 1
        return self.counters[key]

    async def ping(self) -> bool:
        return not self.fail


@pytest.fixture(scope="session")
def settings() -> Settings:
    """Return the settings used by the test suite."""
    return Settings(
        app_env="test",
        app_debug=True,
        log_level="WARNING",
        database_url=TEST_DATABASE_URL,
        redis_url=TEST_REDIS_URL,
        telegram_bot_token=TEST_BOT_TOKEN,
        telegram_init_data_max_age=3600,
        dev_auth_enabled=True,
        dev_auth_telegram_id=777_000,
        rate_limit_enabled=True,
        rate_limit_requests=10_000,
        search_rate_limit_requests=10_000,
        allowed_providers=["*"],
    )


@pytest.fixture(scope="session")
def bot_token() -> str:
    """Return the bot token used to sign the test payloads."""
    return TEST_BOT_TOKEN


@pytest.fixture
def cache() -> MemoryCache:
    """Return an in-memory cache."""
    return MemoryCache()


@pytest.fixture
async def engine(settings: Settings) -> AsyncIterator[Any]:
    """Create the test engine and make sure the schema exists."""
    from sqlalchemy.exc import OperationalError
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool

    from anime_app.infrastructure.database.models import Base

    test_engine = create_async_engine(
        settings.database_url,
        poolclass=NullPool,
        connect_args={"timeout": 5},
    )
    try:
        async with test_engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    except OperationalError as exc:
        await test_engine.dispose()
        pytest.skip(
            "the PostgreSQL test database is not reachable "
            f"({settings.database_url}): {exc.__class__.__name__}"
        )
    yield test_engine
    await test_engine.dispose()


@pytest.fixture
async def session_factory(engine: Any) -> AsyncIterator[Any]:
    """Return a session factory bound to the test engine."""
    from anime_app.infrastructure.database.session import create_session_factory

    factory = create_session_factory(engine)
    yield factory


@pytest.fixture
async def db_session(session_factory: Any) -> AsyncIterator[Any]:
    """Return an empty database session."""
    from sqlalchemy import text

    async with session_factory() as session:
        await session.execute(
            text(
                "TRUNCATE users, anime, anime_external_refs, user_library RESTART IDENTITY CASCADE"
            )
        )
        await session.commit()
        yield session
        await session.rollback()


@pytest.fixture
def registry() -> ProviderRegistry:
    """Return an empty provider registry."""
    return ProviderRegistry(["*"])


@pytest.fixture
def auth_providers(settings: Settings) -> list[Any]:
    """Return the credential providers used by the tests."""
    return [
        TelegramAuthProvider(
            InitDataValidator(
                settings.telegram_bot_token.get_secret_value(),
                max_age_seconds=settings.telegram_init_data_max_age,
            )
        ),
        DevAuthProvider(telegram_id=settings.dev_auth_telegram_id),
    ]


@pytest.fixture
def container(
    settings: Settings,
    engine: Any,
    session_factory: Any,
    cache: MemoryCache,
    registry: ProviderRegistry,
    auth_providers: list[Any],
) -> AppContainer:
    """Return a container wired to the test doubles."""
    http_client = httpx.AsyncClient(timeout=5.0)
    return AppContainer(
        settings=settings,
        engine=engine,
        session_factory=session_factory,
        cache=cache,
        registry=registry,
        http_client=http_client,
        auth_providers=auth_providers,
    )


@pytest.fixture
async def client(container: AppContainer, settings: Settings) -> AsyncIterator[httpx.AsyncClient]:
    """Return an HTTP client bound to the FastAPI application."""
    application = create_app(settings)
    application.state.container = container

    @application.get("/__test__/boom")
    async def _boom() -> None:
        raise RuntimeError("unexpected failure")

    transport = ASGITransport(app=application)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
        headers={"Authorization": "dev dev"},
    ) as http_client:
        yield http_client
    await container.http_client.aclose()


def build_init_data(
    bot_token: str,
    user: dict[str, Any],
    *,
    auth_date: datetime | None = None,
    extra: dict[str, str] | None = None,
    signature: str | None = None,
) -> str:
    """Build a signed Telegram ``initData`` payload."""
    import hashlib
    import hmac
    import json
    from urllib.parse import urlencode

    moment = auth_date or datetime.now(UTC)
    payload: dict[str, str] = {
        "auth_date": str(int(moment.timestamp())),
        "query_id": "AAH_test_query_id",
        "user": json.dumps(user, ensure_ascii=False),
    }
    if extra:
        payload.update(extra)
    check_string = "\n".join(f"{key}={payload[key]}" for key in sorted(payload))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    digest = signature or hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()
    return f"{urlencode(payload)}&hash={digest}"


@pytest.fixture
def init_data_factory(bot_token: str):
    """Return a factory building signed ``initData`` payloads."""
    return lambda **kwargs: build_init_data(bot_token, **kwargs)


def expiry(minutes: int = 120) -> datetime:
    """Return a timestamp ``minutes`` minutes in the past."""
    return datetime.now(UTC) - timedelta(minutes=minutes)
