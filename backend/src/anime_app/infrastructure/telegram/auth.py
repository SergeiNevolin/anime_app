"""Credential providers used to authenticate the API requests.

Two schemes are supported:

``tma <initData>``
    The production scheme.  The raw ``initData`` string is validated against
    the Telegram signature, see
    :mod:`anime_app.core.security.telegram`.

``dev``
    A development only scheme that authenticates a fixed test user.  It is
    refused in production and can only be enabled explicitly.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from anime_app.core.exceptions import AuthenticationError
from anime_app.core.security.telegram import InitDataValidator
from anime_app.domain.user.models import AuthenticatedIdentity

__all__ = ["AuthProvider", "DevAuthProvider", "TelegramAuthProvider"]


@runtime_checkable
class AuthProvider(Protocol):
    """Translates a credential into an identity."""

    scheme: str

    async def authenticate(self, credential: str) -> AuthenticatedIdentity:
        """Validate the credential and return the identity it describes."""
        ...


class TelegramAuthProvider:
    """Authenticates a Telegram Mini App ``initData`` payload."""

    scheme = "tma"

    def __init__(self, validator: InitDataValidator) -> None:
        """Create the provider.

        Args:
            validator: The validator used to check the Telegram signature.
        """
        self._validator = validator

    async def authenticate(self, credential: str) -> AuthenticatedIdentity:
        """Validate ``initData`` and return the identity it carries.

        Raises:
            AuthenticationError: if the payload is invalid or expired.
        """
        try:
            user = self._validator.validate(credential)
        except AuthenticationError:
            raise
        except Exception as exc:
            raise AuthenticationError("invalid Telegram init data") from exc
        return AuthenticatedIdentity(
            telegram_id=user.id,
            username=user.username,
            first_name=user.first_name,
            language_code=user.language_code,
        )


class DevAuthProvider:
    """Authenticates a fixed development user.

    The provider must not be registered in production environments.
    """

    scheme = "dev"

    def __init__(
        self,
        *,
        telegram_id: int,
        username: str = "dev_user",
        first_name: str = "Developer",
        language_code: str = "ru",
    ) -> None:
        """Create the provider.

        Args:
            telegram_id: Telegram identifier of the development user.
            username: Display name of the development user.
            first_name: First name of the development user.
            language_code: Language code of the development user.
        """
        self._telegram_id = telegram_id
        self._username = username
        self._first_name = first_name
        self._language_code = language_code

    async def authenticate(self, credential: str) -> AuthenticatedIdentity:
        """Return the development identity.

        Raises:
            AuthenticationError: if the credential is not the expected one.
        """
        if credential not in {"", "dev", "1"}:
            raise AuthenticationError("invalid development credential")
        return AuthenticatedIdentity(
            telegram_id=self._telegram_id,
            username=self._username,
            first_name=self._first_name,
            language_code=self._language_code,
            is_development=True,
        )
