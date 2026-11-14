"""FastAPI application factory and entry point."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from anime_app import __version__
from anime_app.api.exception_handlers import register_exception_handlers
from anime_app.api.middleware import RequestContextMiddleware
from anime_app.api.schemas import HealthResponse
from anime_app.api.v1.router import router as v1_router
from anime_app.config import Settings, get_settings
from anime_app.container import AppContainer, build_container
from anime_app.core.logging import configure_logging, get_logger

__all__ = ["app", "create_app", "run"]

logger = get_logger(__name__)

DESCRIPTION = """
Backend of the Anime Watch Telegram Mini App.

The API exposes the anime catalogue, the episode list, the playable sources and
the personal library of the authenticated Telegram user.
"""


@asynccontextmanager
async def _lifespan(application: FastAPI) -> AsyncIterator[None]:
    """Create and release the application resources."""
    settings: Settings = application.state.settings
    container: AppContainer = await build_container(settings)
    application.state.container = container
    logger.info("%s started in %s mode", settings.app_name, settings.app_env)
    try:
        yield
    finally:
        await container.aclose()
        logger.info("%s stopped", settings.app_name)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create the FastAPI application.

    Args:
        settings: Optional settings override, used by the tests.

    Returns:
        The configured application.
    """
    resolved = settings or get_settings()
    configure_logging(resolved.log_level, json_output=resolved.log_json)

    application = FastAPI(
        title=resolved.app_name,
        version=__version__,
        description=DESCRIPTION,
        lifespan=_lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )
    application.state.settings = resolved

    application.add_middleware(RequestContextMiddleware)
    if resolved.cors_origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=resolved.cors_origins,
            allow_credentials=False,
            allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
            expose_headers=["X-Request-ID"],
            max_age=600,
        )

    register_exception_handlers(application)
    application.include_router(v1_router, prefix="/api/v1")

    @application.get("/health/live", response_model=HealthResponse, tags=["health"])
    async def live() -> HealthResponse:
        """Liveness probe: the process is running."""
        return HealthResponse(status="ok", version=__version__)

    @application.get("/health/ready", response_model=HealthResponse, tags=["health"])
    async def ready(request: Request) -> HealthResponse:
        """Readiness probe: the dependencies are reachable."""
        container: AppContainer = request.app.state.container
        checks = {
            "database": await _check_database(container),
            "cache": await container.cache.ping(),
        }
        status_value = "ok" if all(checks.values()) else "degraded"
        return HealthResponse(status=status_value, version=__version__, checks=checks)

    return application


async def _check_database(container: AppContainer) -> bool:
    """Return whether the database answers a trivial query."""
    try:
        async with container.engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        return True
    except Exception:
        logger.warning("the database is not reachable", exc_info=True)
        return False


app = create_app()


def run() -> None:
    """Run the API with uvicorn."""
    settings = get_settings()
    uvicorn.run(
        "anime_app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.is_development,
        log_config=None,
    )


if __name__ == "__main__":  # pragma: no cover
    run()
