"use client";

import { AnimeHeader } from "@/components/anime/anime-header";
import { AppShell } from "@/components/layout/app-shell";
import { LibraryControls } from "@/components/library/library-controls";
import { PlaybackSelectors } from "@/components/player/playback-selectors";
import { VideoPlayer } from "@/components/player/video-player";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnimeWorkspace } from "@/features/anime/use-anime-workspace";

/**
 * The interactive part of the anime page: the card, the library controls, the
 * selectors and the player.
 */
export function AnimePageContent({ animeId }: { animeId: string }) {
  const workspace = useAnimeWorkspace(animeId);
  const {
    anime,
    isPending,
    error,
    episodes,
    libraryEntry,
    libraryStatus,
    isInLibrary,
    selectedEpisodeId,
    selectedSourceKey,
    selectedPlaybackIndex,
    sources,
    playbackOptions,
    currentEpisode,
    currentOption,
    expanded,
    isMutating,
    toggleExpanded,
    selectEpisode,
    selectSource,
    selectPlayback,
    changeStatus,
    addToLibrary,
  } = workspace;

  if (isPending) {
    return (
      <AppShell title="Загрузка…" back>
        <div className="flex flex-col gap-4 py-8">
          <Skeleton className="h-[168px] w-[112px] rounded-control" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-32 w-full" />
        </div>
      </AppShell>
    );
  }

  if (error || !anime) {
    return (
      <AppShell title="Ошибка" back>
        <ErrorState
          title="Не удалось загрузить карточку"
          description={String(error ?? "Аниме не найдено")}
        />
      </AppShell>
    );
  }

  return (
    <AppShell title={anime.title} subtitle={anime.original_title ?? undefined} back>
      <div className="mx-auto w-full max-w-3xl px-4 pb-6">
        <AnimeHeader anime={anime} expanded={expanded} onToggleExpand={toggleExpanded} />

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() => {
              document
                .getElementById("player")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          >
            {libraryEntry ? "Продолжить просмотр" : "Начать просмотр"}
          </Button>
          {!isInLibrary ? (
            <Button
              variant="secondary"
              onClick={() => void addToLibrary()}
              disabled={isMutating}
            >
              В библиотеку
            </Button>
          ) : null}
        </div>

        {isInLibrary ? (
          <LibraryControls
            status={libraryStatus}
            progress={libraryEntry?.progress_episode ?? 0}
            totalEpisodes={anime.total_episodes}
            onStatusChange={(status) => void changeStatus(status)}
          />
        ) : null}

        <PlaybackSelectors
          episodes={episodes}
          sources={sources}
          playbackOptions={playbackOptions}
          selectedEpisodeId={selectedEpisodeId}
          selectedSourceKey={selectedSourceKey}
          selectedPlaybackIndex={selectedPlaybackIndex}
          onEpisodeChange={selectEpisode}
          onSourceChange={selectSource}
          onPlaybackChange={selectPlayback}
        />

        <div id="player" className="mt-4 scroll-mt-16">
          {currentEpisode && currentOption ? (
            <VideoPlayer
              src={currentOption.url}
              headers={currentOption.headers}
              title={currentOption.source_title}
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-control bg-surface-muted">
              <p className="px-6 text-center text-[13px] text-text-muted">
                {currentEpisode
                  ? "Источник не выбран или недоступен."
                  : "Выберите серию для просмотра."}
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
