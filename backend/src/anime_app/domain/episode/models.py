"""Episode and playback domain models."""

from __future__ import annotations

import base64
import binascii
import hashlib
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

__all__ = [
    "AnimeEpisode",
    "EpisodeSource",
    "InvalidEpisodeIdError",
    "PlaybackKind",
    "PlaybackOption",
    "decode_episode_id",
    "encode_episode_id",
    "source_key",
]

SEPARATOR = "\x1f"


class InvalidEpisodeIdError(ValueError):
    """Raised when an episode identifier cannot be decoded."""


class PlaybackKind(StrEnum):
    """How a stream has to be played."""

    HLS = "hls"
    MP4 = "mp4"
    DASH = "dash"
    EMBED = "embed"
    EXTERNAL = "external"


class AnimeEpisode(BaseModel):
    """A single episode of an anime."""

    model_config = ConfigDict(frozen=True)

    provider: str
    anime_external_id: str
    external_id: str
    number: int
    title: str | None = None
    is_available: bool = True

    @computed_field  # type: ignore[prop-decorator]
    @property
    def id(self) -> str:
        """Return the opaque identifier used by the API."""
        return encode_episode_id(self.provider, self.anime_external_id, self.external_id)


class EpisodeSource(BaseModel):
    """A concrete playback source (player + dubbing) of an episode."""

    model_config = ConfigDict(frozen=True)

    provider: str
    key: str
    title: str
    player: str = "unknown"
    external_url: str | None = None
    official_url: str | None = None

    @field_validator("key")
    @classmethod
    def _key_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("source key must not be empty")
        return value


class PlaybackOption(BaseModel):
    """A resolved, directly playable stream.

    ``url`` is a temporary, signed link.  It must never be persisted.
    """

    provider: str
    source_key: str
    source_title: str
    kind: PlaybackKind
    quality: int = 0
    url: str
    headers: dict[str, str] = Field(default_factory=dict)
    official_url: str | None = None


def encode_episode_id(provider: str, anime_external_id: str, episode_external_id: str) -> str:
    """Encode the coordinates of an episode into an opaque, URL safe id.

    The identifier is base64url encoded so that it never contains characters
    that would break a URL path segment.
    """
    payload = SEPARATOR.join((provider, anime_external_id, episode_external_id)).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def decode_episode_id(episode_id: str) -> tuple[str, str, str]:
    """Decode an episode identifier.

    Returns:
        A ``(provider, anime_external_id, episode_external_id)`` tuple.

    Raises:
        InvalidEpisodeIdError: if the identifier is malformed.
    """
    if not episode_id:
        raise InvalidEpisodeIdError("episode id is empty")
    padding = "=" * (-len(episode_id) % 4)
    try:
        raw = base64.urlsafe_b64decode(episode_id + padding).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError, ValueError) as exc:
        raise InvalidEpisodeIdError("episode id is not a valid identifier") from exc
    parts = raw.split(SEPARATOR)
    if len(parts) != 3 or not all(parts):
        raise InvalidEpisodeIdError("episode id has an unexpected structure")
    return parts[0], parts[1], parts[2]


def source_key(title: str, url: str) -> str:
    """Return a stable identifier for a playback source."""
    digest = hashlib.sha256(f"{title}|{url}".encode()).hexdigest()
    return digest[:16]
