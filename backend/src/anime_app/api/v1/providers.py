"""Provider introspection endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from anime_app.api.dependencies import CurrentUser, RegistryDep
from anime_app.domain.providers.base import ProviderInfo

__all__ = ["router"]

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("", response_model=list[ProviderInfo], summary="Return the available providers")
async def read_providers(registry: RegistryDep, user: CurrentUser) -> list[ProviderInfo]:
    """Return the description of every registered content provider."""
    return registry.describe()
