"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

import { AnimeDetailsHeader } from "@/components/anime/anime-details-header";
import { EpisodeList } from "@/components/anime/episode-list";
import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { useAnimeDetails, useAnimeEpisodes } from "@/features/anime/hooks";
import { useCurrentUser } from "@/features/auth/hooks";
import { useAddToLibrary, useUpdateLibraryEntry } from "@/features/library/hooks";
import type { LibraryStatus } from "@/lib/api/types";

export default function AnimePage() {
  const params = useParams();
  const animeId = params.id as string;
  const { data: user } = useCurrentUser();
  const { data: anime, isPending: animePending, isError: animeError, error: animeErr } = useAnimeDetails(animeId);
  const { data: episodesData, isPending: episodesPending, isError: episodesError, error: episodesErr } = useAnimeEpisodes(animeId);
  const addToLibrary = useAddToLibrary();
  const updateLibrary = useUpdateLibraryEntry();
  const [selectedEpisode, setSelectedEpisode] = useState<string | null>(episodesData?.items[0]?.id ?? null);
  const [isInLibrary, setIsInLibrary] = useState(false);
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>("plan_to_watch");
  const [libraryProgress, setLibraryProgress] = useState(0);

  const episodes = episodesData?.items ?? [];

  const handleAddToLibrary = async (status: LibraryStatus = "plan_to_watch", progress = 0) => {
    try {
      await addToLibrary.mutateAsync({ animeId, status, progressEpisode: progress });
      setIsInLibrary(true);
      setLibraryStatus(status);
      setLibraryProgress(progress);
    } catch {
      // Error handled by mutation
    }
  };

  const handleUpdateProgress = async (progress: number) => {
    try {
      await updateLibrary.mutateAsync({ animeId, progressEpisode: progress });
      setLibraryProgress(progress);
      if (progress > 0 && libraryStatus === "plan_to_watch") {
        await updateLibrary.mutateAsync({ animeId, status: "watching" });
        setLibraryStatus("watching");
      }
    } catch {
      // Error handled by mutation
    }
  };

  const handleStatusChange = async (status: LibraryStatus) => {
    try {
      await updateLibrary.mutateAsync({ animeId, status });
      setLibraryStatus(status);
    } catch {
      // Error handled by mutation
    }
  };

  if (animePending) {
    return (
      <AppShell title="Загрузка…" back>
        <div className="flex flex-col gap-4 py-8">
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
    <AppShell title={anime.title} subtitle={anime.original_title ?? undefined} back>
      <AnimeDetailsHeader anime={anime} />

      {anime.description && (
        <section className="mt-5" aria-labelledby="description-heading">
          <h3 id="description-heading" className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-text-muted">
            Описание
          </h3>
          <p className="text-[14px] leading-relaxed text-text whitespace-pre-line">{anime.description}</p>
        </section>
      )}

      <section className="mt-5" aria-labelledby="episodes-heading">
        <div className="flex items-center justify-between mb-2">
          <h3 id="episodes-heading" className="text-[13px] font-semibold uppercase tracking-wide text-text-muted">
            Эпизоды {episodesData?.total ? `(${episodesData.total})` : ""}
          </h3>
        </div>
        {episodesPending && episodes.length === 0 ? (
          <div className="flex flex-col gap-3 py-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : episodesError ? (
          <ErrorState
            title="Ошибка загрузки эпизодов"
            description={episodesErr instanceof Error ? episodesErr.message : "Не удалось загрузить список эпизодов"}
            onRetry={() => window.location.reload()}
          />
        ) : episodes.length === 0 ? (
          <p className="py-4 text-[13px] text-text-muted">Эпизоды не найдены.</p>
        ) : (
          <EpisodeList
            episodes={episodes}
            selectedId={selectedEpisode}
            onSelect={(ep) => setSelectedEpisode(ep.id)}
          />
        )}
      </section>

      {user && (
        <section className="mt-6 border-t border-border pt-4" aria-labelledby="library-heading">
          <h3 id="library-heading" className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-text-muted">
            В библиотеке
          </h3>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="flex flex-wrap gap-2">
              {["plan_to_watch", "watching", "completed", "on_hold", "dropped"].map((status) => (
                <Button
                  key={status}
                  variant={libraryStatus === status ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => handleStatusChange(status as LibraryStatus)}
                  disabled={addToLibrary.isPending || updateLibrary.isPending}
                >
                  {status.replace("_", " ")}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[13px] text-text-muted">Прогресс:</span>
              <input
                type="number"
                min="0"
                max={anime.total_episodes ?? 1000}
                value={libraryProgress}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 0;
                  setLibraryProgress(val);
                  handleUpdateProgress(val);
                }}
                className="w-20 px-2 py-1.5 text-[13px] border border-border rounded-control bg-surface text-text"
              />
              {anime.total_episodes && (
                <span className="text-[13px] text-text-muted">/ {anime.total_episodes}</span>
              )}
            </div>
          </div>
          {!isInLibrary && (
            <Button
              className="mt-3 w-full sm:w-auto"
              onClick={() => handleAddToLibrary("plan_to_watch", 0)}
              disabled={addToLibrary.isPending}
            >
              {addToLibrary.isPending ? "Добавление…" : "Добавить в библиотеку"}
            </Button>
          )}
        </section>
      )}
    </AppShell>
  );
}