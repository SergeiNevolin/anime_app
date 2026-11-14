"""Middlewares of the HTTP API."""

from __future__ import annotations

import time
import uuid
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from anime_app.core.logging import get_logger, request_id_var

__all__ = ["RequestContextMiddleware"]

logger = get_logger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"
_MAX_REQUEST_ID_LENGTH = 64


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attach a request id to every request and log its outcome."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        """Process the request."""
        request_id = request.headers.get(REQUEST_ID_HEADER, "").strip()
        if not request_id or len(request_id) > _MAX_REQUEST_ID_LENGTH:
            request_id = uuid.uuid4().hex
        token = request_id_var.set(request_id)
        request.state.request_id = request_id
        started = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        duration_ms = (time.perf_counter() - started) * 1000
        response.headers[REQUEST_ID_HEADER] = request_id
        logger.info(
            "%s %s -> %s in %.1fms",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response
