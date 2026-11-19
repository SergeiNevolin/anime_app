"""Telegram authentication use case."""

from __future__ import annotations

from anime_app.core.exceptions import AuthenticationError
from anime_app.core.logging import get_logger
from anime_app.core.security.telegram import parse_authorization_header
from anime_app.domain.user.models import AuthenticatedIdentity, User
from anime_app.domain.user.repositories import UserRepository
from anime_app.infrastructure.telegram.auth import AuthProvider

__all__ = ["AuthService"]

logger = get_logger(__name__)


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
        return await self._resolve(identity)

    async def authenticate_optional(self, authorization: str | None) -> User | None:
        """Authenticate the request when it carries a usable credential.

        The header is optional: ``None`` means the caller is a guest.  A header
        that cannot be used (unregistered scheme, forged or expired payload) is
        also reported as a guest so that the request stays serviceable; the
        reason is logged without the credential itself.

        Args:
            authorization: Value of the ``Authorization`` header, if any.
        """
        parsed = parse_authorization_header(authorization)
        if parsed is None:
            return None
        scheme, credential = parsed
        provider = self._providers.get(scheme)
        if provider is None:
            logger.warning("ignoring the %r authorization scheme: no provider registered", scheme)
            return None
        try:
            identity = await provider.authenticate(credential)
        except AuthenticationError as exc:
            logger.warning("ignoring a rejected %r credential: %s", scheme, exc.message)
            return None
        return await self._resolve(identity)

    async def _resolve(self, identity: AuthenticatedIdentity) -> User:
        """Return the stored user described by ``identity``."""
        user = await self._users.get_or_create(
            telegram_id=identity.telegram_id,
            username=identity.username,
            first_name=identity.first_name,
            language_code=identity.language_code,
        )
        await self._users.touch(user.id)
        return user
