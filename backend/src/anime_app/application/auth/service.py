"""Telegram authentication use case."""

from __future__ import annotations

from anime_app.core.exceptions import AuthenticationError
from anime_app.core.security.telegram import parse_authorization_header
from anime_app.domain.user.models import User
from anime_app.domain.user.repositories import UserRepository
from anime_app.infrastructure.telegram.auth import AuthProvider

__all__ = ["AuthService"]


class AuthService:
    """Authenticate a request and resolve the matching application user."""

    def __init__(self, user_repository: UserRepository, providers: list[AuthProvider]) -> None:
        """Create the service.

        Args:
            user_repository: Storage for the users.
            providers: The registered credential providers.
        """
        self._users = user_repository
        self._providers = {provider.scheme: provider for provider in providers}

    async def authenticate(self, authorization: str | None) -> User:
        """Authenticate the request and return (or create) the user.

        Args:
            authorization: Value of the ``Authorization`` header.

        Raises:
            AuthenticationError: if the header is missing, uses an unknown
                scheme or the credential is rejected.
        """
        parsed = parse_authorization_header(authorization)
        if parsed is None:
            raise AuthenticationError("missing or malformed Authorization header")
        scheme, credential = parsed
        provider = self._providers.get(scheme)
        if provider is None:
            raise AuthenticationError(f"unsupported authorization scheme: {scheme!r}")
        identity = await provider.authenticate(credential)
        user = await self._users.get_or_create(
            telegram_id=identity.telegram_id,
            username=identity.username,
            first_name=identity.first_name,
            language_code=identity.language_code,
        )
        await self._users.touch(user.id)
        return user
