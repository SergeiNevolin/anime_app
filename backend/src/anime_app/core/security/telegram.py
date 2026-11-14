"""Validation of the Telegram Mini App ``initData`` payload.

Telegram signs the raw ``initData`` query string with an HMAC-SHA256 key that
is derived from the bot token.  The server must recompute that signature and
compare it with the ``hash`` field shipped by the client before trusting any
of the other fields.

Reference: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qsl

from anime_app.core.exceptions import AuthenticationError

__all__ = [
    "InitDataValidator",
    "TelegramUser",
    "TelegramValidationError",
    "parse_authorization_header",
]


class TelegramValidationError(AuthenticationError):
    """The ``initData`` payload is missing, malformed, forged or expired."""

    code = "INVALID_INIT_DATA"
    status_code = 401
    message = "Invalid Telegram init data"


@dataclass(frozen=True, slots=True)
class TelegramUser:
    """The subset of the Telegram user profile the application stores."""

    id: int
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    language_code: str | None = None
    is_premium: bool = False
    allows_write_to_pm: bool | None = None

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> TelegramUser:
        """Build a :class:`TelegramUser` from the decoded ``user`` JSON object."""
        raw_id = payload.get("id")
        if isinstance(raw_id, bool) or not isinstance(raw_id, int):
            raise TelegramValidationError("Telegram user payload does not contain a numeric id")

        def _optional_str(key: str) -> str | None:
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value
            return None

        allows_write = payload.get("allows_write_to_pm")
        return cls(
            id=raw_id,
            username=_optional_str("username"),
            first_name=_optional_str("first_name"),
            last_name=_optional_str("last_name"),
            language_code=_optional_str("language_code"),
            is_premium=bool(payload.get("is_premium", False)),
            allows_write_to_pm=allows_write if isinstance(allows_write, bool) else None,
        )


class InitDataValidator:
    """Validate the raw ``initData`` string sent by a Telegram Mini App.

    The validator is intentionally side-effect free and dependency free so that
    it can be unit tested exhaustively without any network or database access.
    """

    SECRET_KEY = b"WebAppData"
    HASH_FIELD = "hash"
    AUTH_DATE_FIELD = "auth_date"
    USER_FIELD = "user"

    def __init__(
        self,
        bot_token: str,
        *,
        max_age_seconds: int = 86_400,
        clock_skew_seconds: int = 30,
        time_source: Callable[[], float] = time.time,
    ) -> None:
        """Create a validator.

        Args:
            bot_token: Telegram bot token used to derive the signature key.
            max_age_seconds: Maximum accepted age of the payload.
            clock_skew_seconds: Tolerance for timestamps slightly in the future.
            time_source: Injectable clock, used by tests.
        """
        if not bot_token:
            raise ValueError("bot_token must not be empty")
        self._bot_token = bot_token
        self._max_age_seconds = max_age_seconds
        self._clock_skew_seconds = clock_skew_seconds
        self._time_source = time_source

    # -- public API ------------------------------------------------------

    def validate(self, init_data: str) -> TelegramUser:
        """Validate ``init_data`` and return the authenticated Telegram user.

        Raises:
            TelegramValidationError: if the payload is missing, malformed,
                carries an invalid signature, is too old or has no user.
        """
        data = self.parse(init_data)
        self.validate_signature(data)
        self.validate_freshness(data)
        return self.extract_user(data)

    def parse(self, init_data: str) -> dict[str, str]:
        """Parse the raw query string into a dictionary.

        Raises:
            TelegramValidationError: if the payload is empty or not a string.
        """
        if not init_data or not isinstance(init_data, str):
            raise TelegramValidationError("init data is empty")
        try:
            pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=True)
        except ValueError as exc:
            raise TelegramValidationError("init data is malformed") from exc
        if not pairs:
            raise TelegramValidationError("init data is malformed")
        return dict(pairs)

    def build_data_check_string(self, data: dict[str, str]) -> str:
        """Build the ``data_check_string`` used for the signature.

        The string contains every field except ``hash``, sorted by key and
        joined with a newline.
        """
        filtered = {key: value for key, value in data.items() if key != self.HASH_FIELD}
        return "\n".join(f"{key}={filtered[key]}" for key in sorted(filtered))

    def compute_hash(self, data_check_string: str) -> str:
        """Compute the expected signature for ``data_check_string``."""
        secret_key = hmac.new(
            self.SECRET_KEY,
            self._bot_token.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        return hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

    def validate_signature(self, data: dict[str, str]) -> None:
        """Recompute and compare the Telegram signature.

        Raises:
            TelegramValidationError: if the ``hash`` field is missing or does
                not match the recomputed signature.
        """
        received = data.get(self.HASH_FIELD)
        if not received:
            raise TelegramValidationError("init data does not contain a signature")
        expected = self.compute_hash(self.build_data_check_string(data))
        if not hmac.compare_digest(expected, received):
            raise TelegramValidationError("init data signature mismatch")

    def validate_freshness(self, data: dict[str, str]) -> None:
        """Ensure the payload is not older than the configured maximum age.

        Raises:
            TelegramValidationError: if ``auth_date`` is missing, malformed or
                outside of the accepted window.
        """
        raw_auth_date = data.get(self.AUTH_DATE_FIELD)
        if raw_auth_date is None:
            raise TelegramValidationError("init data does not contain auth_date")
        try:
            auth_date = int(raw_auth_date)
        except (TypeError, ValueError) as exc:
            raise TelegramValidationError("init data contains an invalid auth_date") from exc

        now = self._time_source()
        age = now - auth_date
        if age > self._max_age_seconds:
            raise TelegramValidationError("init data has expired")
        if age < -self._clock_skew_seconds:
            raise TelegramValidationError("init data auth_date is in the future")

    def extract_user(self, data: dict[str, str]) -> TelegramUser:
        """Decode and validate the ``user`` field.

        Raises:
            TelegramValidationError: if the field is missing or not valid JSON.
        """
        raw_user = data.get(self.USER_FIELD)
        if not raw_user:
            raise TelegramValidationError("init data does not contain a user")
        try:
            payload = json.loads(raw_user)
        except json.JSONDecodeError as exc:
            raise TelegramValidationError("init data contains a malformed user") from exc
        if not isinstance(payload, dict):
            raise TelegramValidationError("init data contains a malformed user")
        return TelegramUser.from_payload(payload)


def parse_authorization_header(header: str | None) -> tuple[str, str] | None:
    """Split an ``Authorization`` header into ``(scheme, credential)``.

    Returns ``None`` when the header is absent or malformed.
    """
    if not header:
        return None
    parts = header.strip().split(None, 1)
    if not parts:
        return None
    scheme = parts[0].lower()
    credential = parts[1].strip() if len(parts) > 1 else ""
    if not credential:
        return None
    return scheme, credential
