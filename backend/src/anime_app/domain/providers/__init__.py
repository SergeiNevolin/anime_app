"""Provider ports.

The application talks to content sources exclusively through the interfaces
defined in this module.  Concrete adapters live in
:mod:`anime_app.infrastructure.providers`.
"""

from anime_app.domain.providers.base import (
    AnimeCatalogProvider,
    PlaybackProvider,
    ProviderInfo,
    ProviderKind,
)
from anime_app.domain.providers.registry import ProviderRegistry

__all__ = [
    "AnimeCatalogProvider",
    "PlaybackProvider",
    "ProviderInfo",
    "ProviderKind",
    "ProviderRegistry",
]
