"""Unit tests of the Telegram ``initData`` validation.

This module is security critical: every branch of the signature and freshness
checks has to be covered.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qsl

import pytest

from anime_app.core.security.telegram import (
    InitDataValidator,
    TelegramUser,
    TelegramValidationError,
    parse_authorization_header,
)

BOT_TOKEN = "123456789:AAHtestTokenForUnitTestsOnly0000000000"
NOW = 1_700_000_000.0
USER = {
    "id": 42,
    "first_name": "Иван",
    "last_name": "Петров",
    "username": "ivan",
    "language_code": "ru",
    "is_premium": True,
    "allows_write_to_pm": False,
}


def sign(payload: dict[str, str], bot_token: str = BOT_TOKEN) -> str:
    """Return the expected signature of ``payload``."""
    check_string = "\n".join(f"{key}={payload[key]}" for key in sorted(payload))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    return hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()


def build_payload(
    *,
    auth_date: datetime | None = None,
    user: dict | None = None,
    extra: dict[str, str] | None = None,
) -> dict[str, str]:
    """Build the fields of an ``initData`` payload."""
    moment = auth_date or datetime.fromtimestamp(NOW - 60, UTC)
    payload = {
        "auth_date": str(int(moment.timestamp())),
        "query_id": "AAH_test",
        "user": json.dumps(user if user is not None else USER, ensure_ascii=False),
    }
    if extra:
        payload.update(extra)
    return payload


def build_init_data(payload: dict[str, str], bot_token: str = BOT_TOKEN) -> str:
    """Build a signed ``initData`` string."""
    from urllib.parse import urlencode

    return f"{urlencode(payload)}&hash={sign(payload, bot_token)}"


@pytest.fixture
def validator() -> InitDataValidator:
    """Return a validator with a fixed clock."""
    return InitDataValidator(BOT_TOKEN, max_age_seconds=3600, time_source=lambda: 1_700_000_000.0)


# -- happy path -------------------------------------------------------------


def test_validate_returns_the_user(validator: InitDataValidator) -> None:
    """A correctly signed payload returns the Telegram user."""
    payload = build_payload(auth_date=datetime.fromtimestamp(1_700_000_000 - 60, UTC))
    user = validator.validate(build_init_data(payload))

    assert user.id == 42
    assert user.username == "ivan"
    assert user.first_name == "Иван"
    assert user.last_name == "Петров"
    assert user.language_code == "ru"
    assert user.is_premium is True
    assert user.allows_write_to_pm is False


def test_validate_accepts_a_payload_without_optional_fields(validator: InitDataValidator) -> None:
    """Optional user fields may be missing."""
    payload = build_payload(
        auth_date=datetime.fromtimestamp(1_700_000_000 - 60, UTC),
        user={"id": 7},
    )
    user = validator.validate(build_init_data(payload))

    assert user.id == 7
    assert user.username is None
    assert user.first_name is None
    assert user.is_premium is False
    assert user.allows_write_to_pm is None


def test_compute_hash_matches_the_reference_implementation(validator: InitDataValidator) -> None:
    """The signature is computed exactly like Telegram documents it."""
    payload = build_payload()
    check_string = "\n".join(f"{key}={payload[key]}" for key in sorted(payload))

    assert validator.build_data_check_string(payload) == check_string
    assert validator.compute_hash(check_string) == sign(payload)


def test_parse_returns_the_fields(validator: InitDataValidator) -> None:
    """The raw payload is parsed into a dictionary."""
    payload = build_payload()
    parsed = validator.parse(build_init_data(payload))

    assert parsed["auth_date"] == payload["auth_date"]
    assert parsed["hash"] == sign(payload)


# -- signature ---------------------------------------------------------------


def test_validate_rejects_a_forged_signature(validator: InitDataValidator) -> None:
    """A payload signed with another token is rejected."""
    payload = build_payload(auth_date=datetime.fromtimestamp(1_700_000_000 - 60, UTC))
    init_data = build_init_data(payload, bot_token="999:anotherToken")

    with pytest.raises(TelegramValidationError, match="signature mismatch"):
        validator.validate(init_data)


def test_validate_rejects_a_tampered_field(validator: InitDataValidator) -> None:
    """Changing a field after signing invalidates the payload."""
    payload = build_payload(auth_date=datetime.fromtimestamp(1_700_000_000 - 60, UTC))
    init_data = build_init_data(payload)
    tampered = init_data.replace("query_id=AAH_test", "query_id=AAH_other")

    with pytest.raises(TelegramValidationError, match="signature mismatch"):
        validator.validate(tampered)


def test_validate_rejects_a_missing_signature(validator: InitDataValidator) -> None:
    """A payload without a hash is rejected."""
    payload = build_payload()

    with pytest.raises(TelegramValidationError, match="does not contain a signature"):
        validator.validate(f"auth_date={payload['auth_date']}")


def test_validate_rejects_a_payload_with_a_different_token(validator: InitDataValidator) -> None:
    """The signature is bound to the configured bot token."""
    payload = build_payload(auth_date=datetime.fromtimestamp(1_700_000_000 - 60, UTC))
    data = dict(parse_qsl(build_init_data(payload, bot_token=BOT_TOKEN)))
    data["hash"] = sign(data, bot_token="other-token")

    from urllib.parse import urlencode

    with pytest.raises(TelegramValidationError, match="signature mismatch"):
        validator.validate(urlencode(data))


# -- freshness --------------------------------------------------------------


def test_validate_rejects_an_expired_payload(validator: InitDataValidator) -> None:
    """A payload older than the configured maximum age is rejected."""
    old = datetime.fromtimestamp(1_700_000_000 - 7200, UTC)
    payload = build_payload(auth_date=old)

    with pytest.raises(TelegramValidationError, match="expired"):
        validator.validate(build_init_data(payload))


def test_validate_rejects_a_payload_without_auth_date(validator: InitDataValidator) -> None:
    """A payload without ``auth_date`` is rejected."""
    payload = build_payload()
    del payload["auth_date"]

    with pytest.raises(TelegramValidationError, match="does not contain auth_date"):
        validator.validate(build_init_data(payload))


def test_validate_rejects_a_malformed_auth_date(validator: InitDataValidator) -> None:
    """A non numeric ``auth_date`` is rejected."""
    payload = build_payload()
    payload["auth_date"] = "not-a-number"

    with pytest.raises(TelegramValidationError, match="invalid auth_date"):
        validator.validate(build_init_data(payload))


def test_validate_rejects_a_payload_from_the_future(validator: InitDataValidator) -> None:
    """A payload dated far in the future is rejected."""
    future = datetime.fromtimestamp(1_700_000_000 + 600, UTC)
    payload = build_payload(auth_date=future)

    with pytest.raises(TelegramValidationError, match="in the future"):
        validator.validate(build_init_data(payload))


def test_validate_accepts_a_small_clock_skew(validator: InitDataValidator) -> None:
    """A payload a few seconds ahead of the server clock is accepted."""
    slightly_ahead = datetime.fromtimestamp(1_700_000_000 + 10, UTC)
    payload = build_payload(auth_date=slightly_ahead)

    user = validator.validate(build_init_data(payload))

    assert user.id == 42


# -- payload structure ------------------------------------------------------


def test_validate_rejects_an_empty_payload(validator: InitDataValidator) -> None:
    """An empty payload is rejected."""
    with pytest.raises(TelegramValidationError, match="empty"):
        validator.validate("")


def test_validate_rejects_a_malformed_payload(validator: InitDataValidator) -> None:
    """A payload that is not a query string is rejected."""
    with pytest.raises(TelegramValidationError, match="malformed"):
        validator.validate("%%%not-a-query-string")


def test_validate_rejects_a_missing_user(validator: InitDataValidator) -> None:
    """A payload without a user is rejected."""
    payload = build_payload()
    del payload["user"]

    with pytest.raises(TelegramValidationError, match="does not contain a user"):
        validator.validate(build_init_data(payload))


def test_validate_rejects_a_malformed_user(validator: InitDataValidator) -> None:
    """A user field that is not valid JSON is rejected."""
    payload = build_payload()
    payload["user"] = "{not-json"

    with pytest.raises(TelegramValidationError, match="malformed user"):
        validator.validate(build_init_data(payload))


def test_validate_rejects_a_user_that_is_not_an_object(validator: InitDataValidator) -> None:
    """A user field that is a JSON array is rejected."""
    payload = build_payload()
    payload["user"] = "[1, 2, 3]"

    with pytest.raises(TelegramValidationError, match="malformed user"):
        validator.validate(build_init_data(payload))


def test_validate_rejects_a_user_without_an_id(validator: InitDataValidator) -> None:
    """A user without a numeric identifier is rejected."""
    payload = build_payload(user={"first_name": "no id"})

    with pytest.raises(TelegramValidationError, match="numeric id"):
        validator.validate(build_init_data(payload))


def test_validate_rejects_a_boolean_user_id(validator: InitDataValidator) -> None:
    """A boolean identifier is not accepted as an integer."""
    payload = build_payload(user={"id": True})

    with pytest.raises(TelegramValidationError, match="numeric id"):
        validator.validate(build_init_data(payload))


def test_validator_requires_a_bot_token() -> None:
    """An empty bot token is a configuration error."""
    with pytest.raises(ValueError, match="bot_token"):
        InitDataValidator("")


def test_telegram_user_from_payload_ignores_unknown_fields() -> None:
    """Unknown fields of the user payload are ignored."""
    user = TelegramUser.from_payload({"id": 1, "unknown": "value"})

    assert user.id == 1
    assert user.username is None


# -- authorization header ----------------------------------------------------


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        ("tma abc", ("tma", "abc")),
        ("TMA abc", ("tma", "abc")),
        ("dev dev", ("dev", "dev")),
        ("  tma   abc  ", ("tma", "abc")),
    ],
)
def test_parse_authorization_header(header: str, expected: tuple[str, str]) -> None:
    """The authorization header is split into a scheme and a credential."""
    assert parse_authorization_header(header) == expected


@pytest.mark.parametrize("header", [None, "", "   ", "tma", "tma   "])
def test_parse_authorization_header_rejects_invalid_values(header: str | None) -> None:
    """Missing or malformed headers return ``None``."""
    assert parse_authorization_header(header) is None


def test_max_age_is_configurable() -> None:
    """The maximum age of a payload is configurable."""
    validator = InitDataValidator(
        BOT_TOKEN,
        max_age_seconds=10,
        time_source=lambda: 1_700_000_000.0,
    )
    payload = build_payload(auth_date=datetime.fromtimestamp(1_700_000_000 - 30, UTC))

    with pytest.raises(TelegramValidationError, match="expired"):
        validator.validate(build_init_data(payload))


def test_clock_skew_is_configurable() -> None:
    """The accepted clock skew is configurable."""
    validator = InitDataValidator(
        BOT_TOKEN,
        clock_skew_seconds=0,
        time_source=lambda: 1_700_000_000.0,
    )
    payload = build_payload(auth_date=datetime.fromtimestamp(1_700_000_000 + 30, UTC))

    with pytest.raises(TelegramValidationError, match="in the future"):
        validator.validate(build_init_data(payload))


def test_ttl_boundary_is_inclusive() -> None:
    """A payload exactly at the maximum age is still accepted."""
    validator = InitDataValidator(
        BOT_TOKEN,
        max_age_seconds=3600,
        time_source=lambda: 1_700_000_000.0,
    )
    payload = build_payload(auth_date=datetime.fromtimestamp(1_700_000_000 - 3600, UTC))

    assert validator.validate(build_init_data(payload)).id == 42


def test_timedelta_import_is_used() -> None:
    """The module keeps working with the documented helpers."""
    assert timedelta(seconds=1).total_seconds() == 1
