"""Fixtures with the payload shapes returned by the real providers.

The payloads mirror the JSON structures documented by the upstream APIs.  They
are used by the contract tests to make sure that the adapter keeps working
when the external library is updated.
"""

from __future__ import annotations

from typing import Any

__all__ = [
    "ANIBOOM_VIDEO",
    "ANILIBERTY_RELEASE",
    "ANIMELIB_DETAIL",
    "ANIMEVOST_ITEM",
    "ANIME_GO_SEARCH",
    "YUMMY_ITEM",
]

ANILIBERTY_RELEASE: dict[str, Any] = {
    "id": 8443,
    "type": {"value": "TV", "description": "ТВ"},
    "year": 1998,
    "name": {
        "main": "Ковбой Бибоп",
        "english": "Cowboy Bebop",
        "alternative": None,
    },
    "alias": "cowboy-bebop",
    "season": {"value": "spring", "description": "Весна"},
    "poster": {
        "src": "/storage/releases/posters/8443/poster.jpg",
        "preview": "/storage/releases/posters/8443/preview.jpg",
        "thumbnail": "/storage/releases/posters/8443/thumbnail.jpg",
    },
    "description": "Культовый сериал о двух охотниках за головами.",
    "episodes_total": 26,
    "is_ongoing": False,
    "is_in_production": False,
    "genres": [
        {"id": 1, "name": "Комедия", "total_releases": 10},
        {"id": 2, "name": "Приключения", "total_releases": 20},
    ],
}

YUMMY_ITEM: dict[str, Any] = {
    "anime_id": 1636669624,
    "anime_url": "kovboy-bibop",
    "title": "Ковбой Бибоп",
    "description": "Два охотника за головами.",
    "year": 1998,
    "poster": {
        "medium": "//static.yani.tv/posters/full/1636669624.jpg",
        "original": "//static.yani.tv/posters/original/1636669624.jpg",
    },
    "genres": [{"id": 1, "title": "Приключения", "alias": "adventures"}],
    "anime_status": {"id": 2, "title": "Вышел", "alias": "released"},
    "type": {"id": 1, "name": "ТВ", "alias": "tv"},
    "episodes": {"count": 26, "aired": 26},
}

ANIMEVOST_ITEM: dict[str, Any] = {
    "id": 1234,
    "title": "Ковбой Бибоп / Cowboy Bebop [1-26 из 26]",
    "description": "Жизнь охотника за головами полна опасностей.",
    "genre": "Приключения, Драма",
    "year": "1998",
    "urlImagePreview": "https://static.openni.ru/uploads/posts/poster.jpg",
    "screenImage": [],
    "rating": 8.5,
    "votes": 100,
    "timer": 1500.0,
    "type": "TV",
    "director": "Синдзиро Итацу",
    "series": "26",
}

ANIMELIB_DETAIL: dict[str, Any] = {
    "id": 316,
    "name": "Cow Bebop",
    "rus_name": "Ковбой Бибоп",
    "eng_name": "Cowboy Bebop",
    "slug_url": "316--serial-experiments-lain-anime",
    "cover": {
        "filename": "cover.jpg",
        "thumbnail": "https://static.animelib.org/cover-thumb.jpg",
        "default": "https://static.animelib.org/cover-default.jpg",
        "md": "https://static.animelib.org/cover-md.jpg",
    },
    "release_date": "1998-04-03",
    "status": {"id": 2, "label": "Вышел"},
    "anime_type": {"id": 1, "label": "TV"},
    "summary": "Культовый сериал.",
    "genres": [{"id": 1, "name": "Приключения", "adult": False, "alert": False}],
    "teams": [{"id": 1, "slug": "anilibria", "name": "AniLibria", "slug_url": "anilibria"}],
    "other_names": [" Cowboy Bebop "],
}

ANIME_GO_SEARCH: dict[str, Any] = {
    "title": "Ковбой Бибоп",
    "thumbnail": "https://img.cdngos.com/v/250x350/anime/5a/5a6e62aa912c4",
    "url_path": "/anime/kovboy-bibop-276",
}

ANIBOOM_VIDEO: dict[str, Any] = {
    "type": "m3u8",
    "quality": 1080,
    "url": "https://ella.ya-ligh123.site/2e/2ewXokwOXa5/master.m3u8",
    "headers": {
        "Referer": "https://aniboom.one/",
        "Accept-Language": "ru-RU",
        "Origin": "https://aniboom.one",
    },
}
