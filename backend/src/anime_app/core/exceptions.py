"""Application level exceptions.

Every exception that is allowed to reach the API boundary derives from
:class:`AppError`.  The global exception handler converts them into the
unified error envelope documented in the API specification, so internal
exception types and stack traces never leak to the client.
"""

from __future__ import annotations

from typing import Any

__all__ = [
    "AppError",
    "AuthenticationError",
    "ConflictError",
    "NotFoundError",
    "PermissionDeniedError",
    "ProviderError",
    "ProviderTimeoutError",
    "ProviderUnavailableError",
    "RateLimitError",
    "UpstreamError",
    "ValidationError",
]


class AppError(Exception):
    """Base class for every expected (business) error."""

    code: str = "INTERNAL_ERROR"
    status_code: int = 500
    message: str = "Internal server error"

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        status_code: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.message = message or type(self).message
        self.code = code or type(self).code
        self.status_code = status_code or type(self).status_code
        self.details = details or {}
        super().__init__(self.message)


class AuthenticationError(AppError):
    """The caller could not be authenticated."""

    code = "UNAUTHORIZED"
    status_code = 401
    message = "Authentication required"


class PermissionDeniedError(AppError):
    """The caller is authenticated but not allowed to perform the action."""

    code = "FORBIDDEN"
    status_code = 403
    message = "Access denied"


class NotFoundError(AppError):
    """The requested resource does not exist."""

    code = "NOT_FOUND"
    status_code = 404
    message = "Resource not found"


class ConflictError(AppError):
    """The request conflicts with the current state of the resource."""

    code = "CONFLICT"
    status_code = 409
    message = "Resource conflict"


class ValidationError(AppError):
    """The request payload or query parameters are invalid."""

    code = "VALIDATION_ERROR"
    status_code = 422
    message = "Invalid request"


class RateLimitError(AppError):
    """The caller exceeded the allowed request rate."""

    code = "RATE_LIMITED"
    status_code = 429
    message = "Too many requests"

    def __init__(self, message: str | None = None, *, retry_after: int = 60) -> None:
        super().__init__(message)
        self.retry_after = retry_after


class ProviderError(AppError):
    """An external content provider failed."""

    code = "PROVIDER_ERROR"
    status_code = 502
    message = "Content provider returned an error"


class ProviderUnavailableError(ProviderError):
    """An external content provider is temporarily unavailable."""

    code = "PROVIDER_UNAVAILABLE"
    status_code = 503
    message = "Source is temporarily unavailable"


class ProviderTimeoutError(ProviderError):
    """An external content provider did not answer in time."""

    code = "PROVIDER_TIMEOUT"
    status_code = 504
    message = "Source did not respond in time"


class UpstreamError(AppError):
    """A generic failure of an upstream dependency."""

    code = "UPSTREAM_ERROR"
    status_code = 502
    message = "Upstream service error"
