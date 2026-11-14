"""Unit tests of the rate limiter and of the log redaction."""

from __future__ import annotations

import logging

import pytest

from anime_app.core.exceptions import RateLimitError
from anime_app.core.logging import redact_secrets, request_id_var
from anime_app.core.ratelimit import RateLimiter
from tests.conftest import MemoryCache


@pytest.fixture
def cache() -> MemoryCache:
    """Return an in-memory cache."""
    return MemoryCache()


async def test_requests_below_the_limit_are_allowed(cache: MemoryCache) -> None:
    """Requests under the limit are not rejected."""
    limiter = RateLimiter(cache, limit=3, window=60)

    for _ in range(3):
        await limiter.check("user-1")


async def test_requests_above_the_limit_are_rejected(cache: MemoryCache) -> None:
    """The request that exceeds the limit is rejected."""
    limiter = RateLimiter(cache, limit=2, window=60)
    await limiter.check("user-1")
    await limiter.check("user-1")

    with pytest.raises(RateLimitError) as error:
        await limiter.check("user-1")

    assert error.value.retry_after == 60
    assert error.value.status_code == 429


async def test_every_identity_has_its_own_budget(cache: MemoryCache) -> None:
    """The limit is applied per identity."""
    limiter = RateLimiter(cache, limit=1, window=60)
    await limiter.check("user-1")
    await limiter.check("user-2")


async def test_every_scope_has_its_own_budget(cache: MemoryCache) -> None:
    """The limit is applied per scope."""
    limiter = RateLimiter(cache, limit=1, window=60)
    await limiter.check("user-1", scope="search")
    await limiter.check("user-1", scope="library")


async def test_the_limiter_fails_open_when_the_cache_is_unavailable(
    cache: MemoryCache,
) -> None:
    """A cache outage never blocks the requests."""
    cache.fail = True
    limiter = RateLimiter(cache, limit=1, window=60)

    for _ in range(5):
        await limiter.check("user-1")


async def test_a_zero_limit_disables_the_limiter(cache: MemoryCache) -> None:
    """A limit of zero disables the rate limiting."""
    limiter = RateLimiter(cache, limit=0, window=60)

    for _ in range(5):
        await limiter.check("user-1")


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Authorization: tma abcdef123", "Authorization: tma <redacted>"),
        ("init_data=hashvalue123", "init_data=<redacted>"),
        ("token 123456789:AAHabcdefghijklmnopqrstuvwxyz12345", "token <redacted>"),
    ],
)
def test_redact_secrets(text: str, expected: str) -> None:
    """Telegram credentials are removed from the log output."""
    assert redact_secrets(text) == expected


def test_the_request_id_is_added_to_the_records() -> None:
    """Every log record carries the current request id."""
    from anime_app.core.logging import RequestIdFilter

    record = logging.LogRecord("test", logging.INFO, "path", 1, "message", None, None)
    token = request_id_var.set("request-123")
    try:
        RequestIdFilter().filter(record)
        assert record.request_id == "request-123"
    finally:
        request_id_var.reset(token)


def test_the_redaction_filter_rewrites_the_message() -> None:
    """The redaction filter removes the secrets from the message."""
    from anime_app.core.logging import SecretRedactionFilter

    record = logging.LogRecord(
        "test",
        logging.INFO,
        "path",
        1,
        "Authorization: tma secretvalue",
        None,
        None,
    )
    SecretRedactionFilter().filter(record)

    assert "secretvalue" not in record.getMessage()
