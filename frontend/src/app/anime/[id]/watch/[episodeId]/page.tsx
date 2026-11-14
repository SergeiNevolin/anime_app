"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

import { EpisodeList } from "@/components/anime/episode-list";
import { SourceList } from "@/components/player/source-list";
import { VideoPlayer, PlayerPlaceholder, ExternalSourceButton } from "@/components/player/video-player";
import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { useAnimeDetails, useAnimeEpisodes } from "@/features/anime/hooks";
import { useEpisodeSources, usePlaybackOptions } from "@/features/player/hooks";
import { useCurrentUser } from "@/features/auth/hooks";
import { useUpdateLibraryEntry } from "@/features/library/hooks";
import { formatQuality } from "@/lib/utils/format";
import type { EpisodeSource } from "@/lib/api/types";

export default function WatchPage() {
  const params = useParams();
  const router = useRouter();
  const animeId = params.id as string;
  const episodeId = params.episodeId as string;

  const { data: anime, isPending: animePending } = useAnimeDetails(animeId);
  const { data: episodesData } = useAnimeEpisodes(animeId);
  const { data: sources, isPending: sourcesPending, isError: sourcesError, error: sourcesErr } = useEpisodeSources(episodeId);
  const [selectedSourceKey, setSelectedSourceKey] = useState<string | null>(null);
  const { data: playbackOptions, isPending: playbackPending, isError: playbackError, error: playbackErr, refetch: refetchPlayback } = usePlaybackOptions(episodeId, selectedSourceKey);
  const { data: user } = useCurrentUser();
  const updateLibrary = useUpdateLibraryEntry();

  const episodes = episodesData?.items ?? [];
  const currentEpisode = episodes.find((ep) => ep.id === episodeId);
  const [selectedPlaybackIndex, setSelectedPlaybackIndex] = useState(0);

  const currentSource = sources?.find((s) => s.key === selectedSourceKey);
  const currentOption = playbackOptions?.[selectedPlaybackIndex];

  useEffect(() => {
    if (sources && sources.length > 0 && !selectedSourceKey) {
      setSelectedSourceKey(sources[0]!.key);
      setSelectedPlaybackIndex(0);
    }
  }, [sources, selectedSourceKey]);

  const handleSourceSelect = useCallback((source: EpisodeSource) => {
    setSelectedSourceKey(source.key);
    setSelectedPlaybackIndex(0);
  }, []);

  const handlePlaybackSelect = useCallback((index: number) => {
    setSelectedPlaybackIndex(index);
  }, []);

  const handlePlaybackRetry = useCallback(() => {
    refetchPlayback();
  }, [refetchPlayback]);

  const handleEpisodeProgress = useCallback(async (progress: number) => {
    if (!user || !currentEpisode) return;
    try {
      await updateLibrary.mutateAsync({ animeId, progressEpisode: progress });
    } catch {
      // Error handled by mutation
    }
  }, [user, currentEpisode, animeId, updateLibrary]);

  const nextEpisode = episodes.find((ep) => ep.number === (currentEpisode?.number ?? 0) + 1);
  const prevEpisode = episodes.find((ep) => ep.number === (currentEpisode?.number ?? 0) - 1);

  if (animePending) {
    return (
      <AppShell title="Загрузка…" back>
        <div className="flex flex-col gap-4 py-8">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </AppShell>
    );
  }

  if (!anime || !currentEpisode) {
    return (
      <AppShell title="Не найдено" back>
        <ErrorState
          title="Эпизод не найден"
          description="Эпизод или аниме не найдено"
          onRetry={() => router.back()}
        />
      </AppShell>
    );
  }

  const isLoading = sourcesPending || playbackPending;
  const hasError = sourcesError || playbackError;
  const errorMessage = sourcesErr instanceof Error ? sourcesErr.message : playbackErr instanceof Error ? playbackErr.message : "Ошибка загрузки";

  return (
    <AppShell
      title={anime.title}
      subtitle={`Эпизод ${currentEpisode.number}${currentEpisode.title ? `: ${currentEpisode.title}` : ""}`}
      back
    >
      <nav className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-text-muted" aria-label="Breadcrumb">
        <Link href={`/anime/${animeId}`} className="hover:text-accent">
          {anime.title}
        </Link>
        <span aria-hidden="true">/</span>
        <span>Эпизод {currentEpisode.number}</span>
      </nav>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="aspect-video w-full rounded-control bg-black overflow-hidden">
            {currentOption ? (
              <VideoPlayer option={currentOption} />
            ) : isLoading ? (
              <PlayerPlaceholder message="Загрузка источника…" />
            ) : hasError ? (
              <PlayerPlaceholder message={errorMessage} />
            ) : (
              <PlayerPlaceholder message="Выберите источник воспроизведения" />
            )}
          </div>

          {currentSource && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-text-muted">Источник:</span>
              <SourceList
                sources={sources ?? []}
                selectedKey={selectedSourceKey}
                onSelect={handleSourceSelect}
              />
            </div>
          )}

          {currentOption && currentOption.kind !== "external" && playbackOptions && playbackOptions.length > 1 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-text-muted">Качество:</span>
              <div className="flex flex-wrap gap-1.5">
                {playbackOptions.map((opt, idx) => (
                  <Button
                    key={`${opt.provider}-${opt.source_key}-${opt.quality}`}
                    variant={selectedPlaybackIndex === idx ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => handlePlaybackSelect(idx)}
                    disabled={playbackPending}
                  >
                    {formatQuality(opt.quality)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {currentOption?.official_url && (
            <div className="mt-3">
              <ExternalSourceButton url={currentOption.official_url} />
            </div>
          )}

          {hasError && currentOption && (
            <div className="mt-3 p-3 rounded-control bg-destructive/10 border border-destructive/20">
              <p className="text-[13px] text-destructive">{errorMessage}</p>
              <Button variant="secondary" size="sm" className="mt-2" onClick={handlePlaybackRetry}>
                Попробовать снова
              </Button>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            {prevEpisode && (
              <Link
                href={`/anime/${animeId}/watch/${prevEpisode.id}`}
                className="flex items-center gap-2 px-3 py-2 text-[13px] border border-border rounded-control hover:bg-surface-muted"
              >
                <span aria-hidden="true">‹</span>
                <span>Предыдущий</span>
              </Link>
            )}
            <div className="flex-1 text-center text-[13px] text-text-muted">
              Эпизод {currentEpisode.number} из {anime.total_episodes ?? "?"}
            </div>
            {nextEpisode && (
              <Link
                href={`/anime/${animeId}/watch/${nextEpisode.id}`}
                className="flex items-center gap-2 px-3 py-2 text-[13px] border border-border rounded-control hover:bg-surface-muted"
              >
                <span>Следующий</span>
                <span aria-hidden="true">›</span>
              </Link>
            )}
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-16 space-y-4">
            <div className="rounded-control border border-border bg-surface p-3">
              <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
                Эпизоды
              </h4>
              <EpisodeList
                episodes={episodes}
                selectedId={episodeId}
                onSelect={(ep) => router.push(`/anime/${animeId}/watch/${ep.id}`)}
              />
            </div>

            {user && currentEpisode && (
              <div className="rounded-control border border-border bg-surface p-3">
                <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
                  Прогресс
                </h4>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max={anime.total_episodes ?? 1000}
                    value={currentEpisode.number}
                    onChange={(e) => handleEpisodeProgress(parseInt(e.target.value, 10) || 0)}
                    className="w-20 px-2 py-1.5 text-[13px] border border-border rounded-control bg-bg text-text"
                  />
                  <span className="text-[13px] text-text-muted">/ {anime.total_episodes ?? "?"}</span>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}