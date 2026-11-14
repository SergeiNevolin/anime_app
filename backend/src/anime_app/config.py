"""Application configuration.

All runtime behaviour is driven by environment variables (12-factor style).
Values are read once at application start-up and injected into the services
through the dependency container, so that no module reads ``os.environ``
directly.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Annotated, Any, Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

AppEnvironment = Literal["development", "test", "production"]


class Settings(BaseSettings):
    """Runtime settings of the backend service."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # -- application -----------------------------------------------------
    app_name: str = "Anime Watch API"
    app_env: AppEnvironment = "development"
    app_debug: bool = False
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    log_level: str = "INFO"
    log_json: bool = False

    # -- database --------------------------------------------------------
    database_url: str = "postgresql+asyncpg://anime:anime@localhost:5432/anime"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30
    db_echo: bool = False

    # -- redis / cache ---------------------------------------------------
    redis_url: str = "redis://localhost:6379/0"
    cache_ttl_search: int = 60
    cache_ttl_details: int = 300
    cache_ttl_episodes: int = 300
    cache_ttl_sources: int = 120
    cache_enabled: bool = True

    # -- telegram --------------------------------------------------------
    telegram_bot_token: SecretStr | None = None
    telegram_webapp_url: str = "https://example.org"
    telegram_init_data_max_age: int = 86400
    telegram_clock_skew: int = 30

    # -- development only ------------------------------------------------
    dev_auth_enabled: bool = False
    dev_auth_telegram_id: int = 777_000
    dev_auth_username: str = "dev_user"

    # -- http / security -------------------------------------------------
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)
    allowed_providers: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["animelib", "aniliberty"]
    )
    request_body_limit: int = 64 * 1024
    rate_limit_enabled: bool = True
    rate_limit_requests: int = 240
    rate_limit_window: int = 60
    search_rate_limit_requests: int = 30
    search_rate_limit_window: int = 60

    # -- providers -------------------------------------------------------
    provider_timeout: float = 20.0
    provider_connect_timeout: float = 8.0
    provider_max_concurrency: int = 4
    provider_search_limit: int = 20

    # -- bot -------------------------------------------------------------
    bot_enabled: bool = True
    bot_use_polling: bool = True

    @field_validator("cors_origins", "allowed_providers", mode="before")
    @classmethod
    def _split_list(cls, value: Any) -> Any:
        """Split a comma separated list, or decode a JSON array."""
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return []
            if raw.startswith("["):
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError as exc:  # pragma: no cover - defensive
                    raise ValueError(f"invalid JSON list: {exc}") from exc
                return [str(item).strip() for item in parsed if str(item).strip()]
            return [item.strip() for item in raw.split(",") if item.strip()]
        return value

    @field_validator("app_env", mode="before")
    @classmethod
    def _normalize_env(cls, value: Any) -> Any:
        """Normalize the name of the environment."""
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @property
    def is_production(self) -> bool:
        """Return whether the application runs in production."""
        return self.app_env == "production"

    @property
    def is_development(self) -> bool:
        """Return whether the application runs in development."""
        return self.app_env == "development"

    @property
    def telegram_token_value(self) -> str | None:
        """Return the raw bot token, or ``None`` when it is not configured."""
        if self.telegram_bot_token is None:
            return None
        token = self.telegram_bot_token.get_secret_value().strip()
        return token or None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached application settings."""
    return Settings()
