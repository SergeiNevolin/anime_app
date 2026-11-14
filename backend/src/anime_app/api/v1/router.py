"""Aggregation of the version 1 routers."""

from __future__ import annotations

from fastapi import APIRouter

from anime_app.api.v1 import anime, auth, episodes, library, providers

__all__ = ["router"]

router = APIRouter()
router.include_router(auth.router)
router.include_router(anime.router)
router.include_router(episodes.router)
router.include_router(library.router)
router.include_router(providers.router)
