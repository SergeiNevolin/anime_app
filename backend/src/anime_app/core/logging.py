"""Logging configuration.

The application uses the standard library logging stack with two additions:

* a ``request_id`` field injected into every record via a :class:`contextvars`
  context variable (set by the request-id middleware);
* a redaction filter that removes Telegram secrets (``initData`` payloads and
  the bot token) from log output.
"""

from __future__ import annotations

import contextvars
import json
import logging
import re
import sys
from typing import Any

__all__ = [
    "RequestIdFilter",
    "SecretRedactionFilter",
    "configure_logging",
    "get_logger",
    "redact_secrets",
    "request_id_var",
]

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

_REDACTIONS: tuple[tuple[re.Pattern[str], str], ...] = (
    # Authorization: tma <initData>
    (re.compile(r"(?i)(tma\s+)[A-Za-z0-9_\-%.]+"), r"\1<redacted>"),
    # Telegram WebApp init data payloads (query string form)
    (re.compile(r"(?i)(init_?data[=:]\s*)[^\s'\"&]+"), r"\1<redacted>"),
    # Telegram bot token shape: 123456789:AA...
    (re.compile(r"\b\d{6,12}:[A-Za-z0-9_\-]{30,}\b"), "<redacted>"),
    # Explicit hash field of an init data payload
    (re.compile(r"(?i)([&?]hash=)[A-Za-z0-9_\-]+"), r"\1<redacted>"),
)


def redact_secrets(text: str) -> str:
    """Remove Telegram credentials from ``text``."""
    for pattern, replacement in _REDACTIONS:
        text = pattern.sub(replacement, text)
    return text


class RequestIdFilter(logging.Filter):
    """Inject the current request id into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        """Add the request id to the record."""
        record.request_id = request_id_var.get()
        return True


class SecretRedactionFilter(logging.Filter):
    """Redact Telegram secrets from the formatted message."""

    def filter(self, record: logging.LogRecord) -> bool:
        """Remove the secrets from the record."""
        original = record.getMessage()
        redacted = redact_secrets(original)
        if redacted != original:
            record.msg = redacted
            record.args = ()
        return True


class _JsonFormatter(logging.Formatter):
    """Structured single line formatter used in production."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


class _TextFormatter(logging.Formatter):
    """Human readable formatter used during development."""

    def format(self, record: logging.LogRecord) -> str:
        request_id = getattr(record, "request_id", "-")
        stamp = self.formatTime(record, "%H:%M:%S")
        base = f"{stamp} {record.levelname:<7} [{request_id}] {record.name}: "
        message = record.getMessage()
        if record.exc_info:
            message = f"{message}\n{self.formatException(record.exc_info)}"
        return base + message


def configure_logging(level: str = "INFO", *, json_output: bool = False) -> None:
    """Configure the root logger.

    Args:
        level: Minimum level that should be emitted.
        json_output: Emit machine readable JSON lines instead of plain text.
    """
    root = logging.getLogger()
    root.setLevel(level.upper())

    for handler in list(root.handlers):
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level.upper())
    handler.addFilter(RequestIdFilter())
    handler.addFilter(SecretRedactionFilter())
    handler.setFormatter(_JsonFormatter() if json_output else _TextFormatter())
    root.addHandler(handler)

    # Third party libraries are noisy at INFO level.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("aiosqlite").setLevel(logging.WARNING)
    logging.getLogger("aiogram").setLevel(logging.WARNING)
    logging.getLogger("anicli-api").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a logger bound to the application namespace."""
    return logging.getLogger(name)
