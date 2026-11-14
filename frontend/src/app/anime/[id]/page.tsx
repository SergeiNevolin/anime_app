"use client";

import { useParams } from "next/navigation";
import { useState, useEffect, Suspense, useCallback } from "react";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { VideoJSPlayer } from "@/components/player/simple-player";
import { EpisodeSelector } from "@/components/anime/episode-selector";
import { AnimeInfoHeader } from "@/components/anime/anime-info-header";
import { useAnimeDetails, useAnimeEpisodes } from "@/features/anime/hooks";
import { useEpisodeSources, usePlaybackOptions } from "@/features/player/hooks";
import { useUpdateLibraryEntry, useLibrary } from "@/features/library/hooks";
import type { LibraryStatus, LibraryItem, EpisodeSource, PlaybackOption } from "@/lib/api/types";

function AnimePageContent() {
  const params = useParams();
  const animeId = params.id as string;
  const { data: anime, isPending: animePending, isError: animeError, error: animeErr } = useAnimeDetails(animeId);
  const { data: episodesData } = useAnimeEpisodes(animeId);

  // Episode sources and playback options for the currently selected episode
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const { data: sources } = useEpisodeSources(selectedEpisodeId ?? "");
  const { data: playbackOptions } = usePlaybackOptions(selectedEpisodeId ?? "", sources?.[0]?.key ?? null);

  const updateLibrary = useUpdateLibraryEntry();
  const { data: libraryData } = useLibrary(null, { page: 1, pageSize: 1000 });

  const episodes = episodesData?.items ?? [];
  const libraryEntry = libraryData?.items.find((item: LibraryItem) => item.anime_id === animeId);

  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>("plan_to_watch");
  const [theaterMode, setTheaterMode] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);

  const firstEpisode = episodes[0] ?? null;
  const lastWatchedEpisode = (libraryEntry?.progress_episode && episodes[libraryEntry.progress_episode - 1]) ?? null;
  const continueEpisode = (lastWatchedEpisode ?? firstEpisode) as typeof episodes[0] | null;

  // Initialize selected episode
  useEffect(() => {
    if (!selectedEpisodeId && continueEpisode) {
      setSelectedEpisodeId(continueEpisode.id);
    }
  }, [continueEpisode, selectedEpisodeId]);

  useEffect(() => {
    if (libraryEntry) {
      setLibraryStatus(libraryEntry.status);
    }
  }, [libraryEntry]);

  const handleUpdateProgress = useCallback(async (progress: number) => {
    try {
      await updateLibrary.mutateAsync({ animeId, progressEpisode: progress });
      if (progress > 0 && libraryStatus === "plan_to_watch") {
        await updateLibrary.mutateAsync({ animeId, status: "watching" });
        setLibraryStatus("watching");
      }
    } catch {}
  }, [animeId, libraryStatus, updateLibrary]);

  const handleStatusChange = useCallback(async (status: LibraryStatus) => {
    try {
      await updateLibrary.mutateAsync({ animeId, status });
      setLibraryStatus(status);
    } catch {}
  }, [animeId, updateLibrary]);

  const handleEpisodeChange = useCallback((episodeId: string) => {
    setSelectedEpisodeId(episodeId);
  }, []);

  const handleSourceChange = useCallback((_source: EpisodeSource) => {
    // Source change handled by player internally
  }, []);

  const handlePlaybackChange = useCallback((_option: PlaybackOption) => {
    // Playback change handled by player internally
  }, []);

  const handlePlay = useCallback(() => {
    // Play event - could track analytics
  }, []);

  const handlePause = useCallback(() => {
    // Pause event
  }, []);

  const currentEpisode = episodes.find((ep) => ep.id === selectedEpisodeId);

  const handleEnded = useCallback(() => {
    const nextEpisode = episodes.find((ep) => ep.number === (currentEpisode?.number ?? 0) + 1);
    if (nextEpisode) {
      setSelectedEpisodeId(nextEpisode.id);
    }
  }, [episodes, currentEpisode]);

  const handleTimeUpdate = useCallback((currentTime: number, duration: number) => {
    if (duration > 0 && currentTime > 0) {
      const episodeProgress = Math.round((currentTime / duration) * 100);
      if (episodeProgress > 90 && currentEpisode) {
        handleUpdateProgress(currentEpisode.number);
      }
    }
  }, [currentEpisode, handleUpdateProgress]);

  if (animePending) {
    return (
      <AppShell title="Загрузка…" back>
        <div className="flex flex-col gap-4 py-8 max-w-6xl mx-auto px-4">
          <Skeleton className="h-[168px] w-[112px] rounded-control" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </AppShell>
    );
  }

  if (animeError || !anime) {
    return (
      <AppShell title="Ошибка" back>
        <ErrorState
          title="Аниме не найдено"
          description={animeErr instanceof Error ? animeErr.message : "Не удалось загрузить данные"}
          onRetry={() => window.location.reload()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={anime.title}
      subtitle={anime.original_title ?? undefined}
      back
      className={theaterMode ? "bg-black" : ""}
    >
      <div className="relative flex flex-col min-h-screen">
        {/* Top bar */}
        <header className={`sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-2 border-b border-border bg-header/95 backdrop-blur ${theaterMode ? "bg-black/95" : ""}`}>
          <nav className="flex flex-wrap items-center gap-2 text-[12px] text-text-muted" aria-label="Breadcrumb">
            <Link href={`/anime/${animeId}`} className="hover:text-accent truncate max-w-[200px] font-medium">
              {anime.title}
            </Link>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-text">Эпизод {currentEpisode?.number ?? "—"}</span>
          </nav>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheaterMode(!theaterMode)}
              aria-label={theaterMode ? "Выключить кинорежим" : "Включить кинорежим"}
              className={theaterMode ? "text-accent" : ""}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={theaterMode ? "M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" : "M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"} />
              </svg>
            </Button>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden max-w-6xl mx-auto w-full">
          {/* Anime Info Header */}
          <AnimeInfoHeader
            anime={anime}
            animeId={animeId}
            firstEpisode={firstEpisode}
            libraryEntry={libraryEntry}
            libraryStatus={libraryStatus}
            isInLibrary={!!libraryEntry}
            onStatusChange={handleStatusChange}
            onProgressChange={handleUpdateProgress}
            onAddToLibrary={() => handleUpdateProgress(0)}
            expanded={infoExpanded}
            onToggleExpand={setInfoExpanded}
          />

          {/* Episode Selector */}
          <div className="px-4 py-3 border-b border-border bg-surface/50">
            <EpisodeSelector
              episodes={episodes}
              selectedEpisodeId={selectedEpisodeId}
              onChange={handleEpisodeChange}
              currentEpisode={currentEpisode}
              totalEpisodes={(anime.total_episodes ?? null) as number | null}
            />
          </div>

          {/* Player */}
          <div className="relative flex-shrink-0 px-4 py-4">
            {currentEpisode && (
              <div className="relative w-full aspect-video max-w-full">
                <VideoJSPlayer
                  currentEpisodeNumber={currentEpisode.number}
                  totalEpisodes={(anime.total_episodes ?? null) as number | null}
                  episodes={episodes}
                  sources={sources ?? []}
                  playbackOptions={playbackOptions ?? []}
                  onEpisodeChange={handleEpisodeChange}
                  onSourceChange={handleSourceChange}
                  onPlaybackChange={handlePlaybackChange}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onEnded={handleEnded}
                  onTimeUpdate={handleTimeUpdate}
                  autoPlay={true}
                  className="w-full h-full"
                />
              </div>
            )}

{!currentEpisode && (
              <div className="aspect-video w-full rounded-xl bg-black overflow-hidden flex items-center justify-center text-white">
                <p className="text-center px-4">Выберите эпизод для просмотра</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </AppShell>
  );
}

export default function AnimePage() {
  return (
    <Suspense fallback={
      <AppShell title="Загрузка…" back>
        <div className="flex flex-col gap-4 py-8 max-w-6xl mx-auto px-4">
          <Skeleton className="h-[168px] w-[112px] rounded-control" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </AppShell>
    }>
      <AnimePageContent />
    </Suspense>
  );
}