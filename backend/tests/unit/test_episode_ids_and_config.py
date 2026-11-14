"""Unit tests of the episode identifiers and of the configuration."""

from __future__ import annotations

import pytest

from anime_app.core.exceptions import ValidationError
from anime_app.domain.episode.models import (
    AnimeEpisode,
    InvalidEpisodeIdError,
    decode_episode_id,
    encode_episode_id,
    source_key,
)


def test_episode_id_round_trip() -> None:
    """An episode identifier survives an encode/decode round trip."""
    encoded = encode_episode_id("aniliberty", "8443", "8899")

    assert decode_episode_id(encoded) == ("aniliberty", "8443", "8899")


def test_episode_id_is_url_safe() -> None:
    """The identifier never contains characters that break a URL path."""
    encoded = encode_episode_id("animego", "/anime/kovboy-bibop-276", "ep-1")

    assert "/" not in encoded
    assert ":" not in encoded
    assert "+" not in encoded
    assert "=" not in encoded


def test_episode_id_decodes_identifiers_with_separators() -> None:
    """Identifiers containing the separator are handled correctly."""
    encoded = encode_episode_id("animego", "/anime/kovboy-bibop-276", "ep-1")

    provider, anime_external_id, episode_external_id = decode_episode_id(encoded)

    assert provider == "animego"
    assert anime_external_id == "/anime/kovboy-bibop-276"
    assert episode_external_id == "ep-1"


@pytest.mark.parametrize("value", ["", "not-base64!!", "YWJj"])
def test_invalid_episode_ids_are_rejected(value: str) -> None:
    """Malformed identifiers are rejected."""
    with pytest.raises(InvalidEpisodeIdError):
        decode_episode_id(value)


def test_anime_episode_exposes_the_opaque_id() -> None:
    """The episode model exposes the identifier used by the API."""
    episode = AnimeEpisode(
        provider="aniliberty",
        anime_external_id="8443",
        external_id="8899",
        number=1,
    )

    assert episode.id == encode_episode_id("aniliberty", "8443", "8899")


def test_source_key_is_stable() -> None:
    """The source key only depends on the title and the url."""
    assert source_key("AniLiberty", "https://example.org") == source_key(
        "AniLiberty", "https://example.org"
    )
    assert source_key("AniLiberty", "https://example.org") != source_key(
        "AniLiberty", "https://example.org/2"
    )


def test_settings_parse_comma_separated_lists() -> None:
    """A comma separated list is accepted by the configuration."""
    from anime_app.config import Settings

    settings = Settings(cors_origins="http://localhost:3000,http://127.0.0.1:3000")

    assert settings.cors_origins == ["http://localhost:3000", "http://127.0.0.1:3000"]


def test_settings_parse_json_lists() -> None:
    """A JSON array is accepted by the configuration."""
    from anime_app.config import Settings

    settings = Settings(allowed_providers='["aniliberty", "yummy_anime"]')

    assert settings.allowed_providers == ["aniliberty", "yummy_anime"]


def test_settings_parse_empty_lists() -> None:
    """An empty value results in an empty list."""
    from anime_app.config import Settings

    settings = Settings(cors_origins="")

    assert settings.cors_origins == []


def test_settings_expose_the_environment_flags() -> None:
    """The environment helpers reflect the configured environment."""
    from anime_app.config import Settings

    assert Settings(app_env="production").is_production is True
    assert Settings(app_env="development").is_development is True
    assert Settings(app_env="test").is_production is False


def test_settings_hide_the_bot_token() -> None:
    """The bot token is never exposed as a plain string."""
    from anime_app.config import Settings

    settings = Settings(telegram_bot_token="secret-token")

    assert "secret-token" not in repr(settings)
    assert settings.telegram_token_value == "secret-token"
    assert Settings().telegram_token_value is None


def test_the_bot_token_is_required_for_the_telegram_provider() -> None:
    """Without a bot token the Telegram provider cannot be created."""
    from anime_app.core.security.telegram import InitDataValidator

    with pytest.raises(ValueError):
        InitDataValidator("")


def test_validation_error_carries_the_status_code() -> None:
    """The validation error is mapped to the HTTP status 422."""
    error = ValidationError("bad input")

    assert error.status_code == 422
    assert error.code == "VALIDATION_ERROR"
    assert error.message == "bad input"
