"""A deterministic provider used by the end to end tests.

The provider returns a fixed catalogue, so the end to end scenarios never
depend on the availability of an external anime site.  It is registered only
when its identifier is part of the allow list, which happens exclusively in
the test environment.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from anime_app.domain.anime.models import (
    AnimeDetails,
    AnimeGenre,
    AnimeSummary,
    ReleaseStatus,
)
from anime_app.domain.episode.models import (
    AnimeEpisode,
    EpisodeSource,
    PlaybackKind,
    PlaybackOption,
)

__all__ = ["FIXTURE_TITLES", "FixtureProvider"]

# A public test stream, used to check that the player is mounted.  The end to
# end scenarios assert on the interface, not on the pixels of the video.
_TEST_STREAM = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"


@dataclass(frozen=True, slots=True)
class _FixtureTitle:
    external_id: str
    title: str
    original_title: str
    alternative_title: str
    year: int
    episodes: int
    description: str
    genres: tuple[str, ...]
    poster: str
    status: ReleaseStatus = ReleaseStatus.COMPLETED
    dubbing_teams: tuple[str, ...] = ("Озвучка AniLibria",)


FIXTURE_TITLES: tuple[_FixtureTitle, ...] = (
    _FixtureTitle(
        external_id="cowboy-bebop",
        title="Ковбой Бибоп",
        original_title="Cowboy Bebop",
        alternative_title=" Cowboy Bebop ",
        year=1998,
        episodes=3,
        description="Культовый сериал о двух охотниках за головами.",
        genres=("Комедия", "Приключения"),
        poster="/fixtures/poster.svg",
    ),
    _FixtureTitle(
        external_id="naruto",
        title="Наруто",
        original_title="Naruto",
        alternative_title="Naruto Shippuuden",
        year=2002,
        episodes=2,
        description="История юного ниндзя из Конохи.",
        genres=("Сёнэн", "Бойцовские искусства"),
        poster="/fixtures/poster.svg",
        status=ReleaseStatus.ONGOING,
        dubbing_teams=("Озвучка AniLibria", "Озвучка Fansub"),
    ),
)


@dataclass
class FixtureProvider:
    """A catalog and playback provider backed by fixed data."""

    provider_id: str = "fixture"
    display_name: str = "Тестовые данные"
    notes: str = "Deterministic provider used by the end to end tests."
    titles: tuple[_FixtureTitle, ...] = field(default_factory=lambda: FIXTURE_TITLES)

    # -- helpers ---------------------------------------------------------

    def _find(self, external_id: str) -> _FixtureTitle | None:
        return next((title for title in self.titles if title.external_id == external_id), None)

    def _summary(self, title: _FixtureTitle) -> AnimeSummary:
        return AnimeSummary(
            provider=self.provider_id,
            external_id=title.external_id,
            title=title.title,
            original_title=title.original_title,
            alternative_title=title.alternative_title,
            alternative_titles=[title.alternative_title],
            poster_url=title.poster,
            year=title.year,
            genres=[AnimeGenre(name=genre) for genre in title.genres],
            total_episodes=title.episodes,
            release_status=title.status,
            description=title.description,
            dubbing_teams=list(title.dubbing_teams),
            external_url=f"https://example.org/anime/{title.external_id}",
        )

    # -- catalog ---------------------------------------------------------

    async def search(self, query: str, *, limit: int, offset: int) -> list[AnimeSummary]:
        """Return the titles whose name matches ``query``."""
        needle = query.strip().lower()
        matches = [
            self._summary(title)
            for title in self.titles
            if not needle or needle in title.title.lower() or needle in title.original_title.lower()
        ]
        return matches[offset : offset + limit]

    async def get_details(
        self,
        external_id: str,
        *,
        title_hint: str | None = None,
    ) -> AnimeDetails:
        """Return the details of a fixture title."""
        title = self._find(external_id)
        if title is None:
            raise LookupError(external_id)
        details = AnimeDetails(**self._summary(title).model_dump())
        details.available_providers = [self.provider_id]
        return details

    async def get_episodes(
        self,
        external_id: str,
        *,
        title_hint: str | None = None,
    ) -> list[AnimeEpisode]:
        """Return the episodes of a fixture title."""
        title = self._find(external_id)
        if title is None:
            raise LookupError(external_id)
        return [
            AnimeEpisode(
                provider=self.provider_id,
                anime_external_id=title.external_id,
                external_id=f"ep-{number}",
                number=number,
                title=f"Серия {number}",
            )
            for number in range(1, title.episodes + 1)
        ]

    # -- playback --------------------------------------------------------

    async def get_sources(
        self,
        anime_external_id: str,
        episode_external_id: str,
        *,
        title_hint: str | None = None,
    ) -> list[EpisodeSource]:
        """Return the playable sources of a fixture episode."""
        title = self._find(anime_external_id)
        if title is None:
            raise LookupError(anime_external_id)
        return [
            EpisodeSource(
                provider=self.provider_id,
                key=f"{anime_external_id}:{episode_external_id}:{index}",
                title=team,
                player="fixture",
                external_url=f"https://example.org/watch/{anime_external_id}/{episode_external_id}",
                official_url=f"https://example.org/anime/{anime_external_id}",
            )
            for index, team in enumerate(title.dubbing_teams, start=1)
        ]

    async def get_playback_options(
        self,
        anime_external_id: str,
        episode_external_id: str,
        source_key: str,
        *,
        title_hint: str | None = None,
    ) -> list[PlaybackOption]:
        """Return the playable streams of a fixture source."""
        title = self._find(anime_external_id)
        if title is None:
            raise LookupError(anime_external_id)
        sources = await self.get_sources(anime_external_id, episode_external_id)
        source = next((item for item in sources if item.key == source_key), None)
        if source is None:
            raise LookupError(source_key)
        return [
            PlaybackOption(
                provider=self.provider_id,
                source_key=source.key,
                source_title=source.title,
                kind=PlaybackKind.HLS,
                quality=quality,
                url=_TEST_STREAM,
                headers={},
                official_url=source.official_url,
            )
            for quality in (720, 480)
        ]
