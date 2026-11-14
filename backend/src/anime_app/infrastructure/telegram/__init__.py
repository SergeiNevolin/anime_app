"""Telegram authentication adapters."""

from anime_app.infrastructure.telegram.auth import (
    AuthProvider,
    DevAuthProvider,
    TelegramAuthProvider,
)

__all__ = ["AuthProvider", "DevAuthProvider", "TelegramAuthProvider"]
