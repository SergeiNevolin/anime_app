"use client";

import { useMemo } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import type { AnimeEpisode, LibraryItem, LibraryStatus } from "@/lib/api/types";

interface EpisodeSidebarProps {
  episodes: AnimeEpisode[];
  selectedEpisodeId: string | null;
  onEpisodeChange: (episodeId: string) => void;
  libraryEntry: LibraryItem | null | undefined;
  anime: { total_episodes?: number | null };
  onProgressChange: (progress: number) => void;
  onStatusChange: (status: LibraryStatus) => void;
  isPending: boolean;
  error: boolean;
  errorMessage: string;
}

export function EpisodeSidebar({
  episodes,
  selectedEpisodeId,
  onEpisodeChange,
  libraryEntry,
  anime,
  onProgressChange,
  onStatusChange,
  isPending,
  error,
  errorMessage,
}: EpisodeSidebarProps) {
  // Group episodes by season
  const episodesBySeason = useMemo(() => {
    return episodes.reduce((acc, ep) => {
      const season = 1; // Default to season 1 since API doesn't provide season info
      if (!acc[season]) acc[season] = [];
      acc[season].push(ep);
      return acc;
    }, {} as Record<number, AnimeEpisode[]>);
  }, [episodes]);

  const seasonKeys = Object.keys(episodesBySeason).map(Number).sort((a, b) => a - b);

  if (isPending && episodes.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-3 py-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-3">
          <ErrorState
            title="Ошибка загрузки эпизодов"
            description={errorMessage}
            onRetry={() => window.location.reload()}
          />
        </div>
      </div>
    );
  }

  if (episodes.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-3">
          <EmptyState title="Эпизоды не найдены" description="Попробуйте обновить страницу позже." />
        </div>
      </div>
    );
  }

  const renderSeasonEpisodes = (seasonNum: number) => {
    const seasonEpisodes = episodesBySeason[seasonNum] ?? [];
    return (
      <div key={seasonNum} className="mb-4">
        <h4 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          Сезон {seasonNum}
        </h4>
        <div className="divide-y divide-border">
          {seasonEpisodes.map((ep) => (
            <button
              key={ep.id}
              onClick={() => onEpisodeChange(ep.id)}
              disabled={!ep.is_available}
              className={`flex items-center justify-between gap-3 p-2.5 w-full text-left transition-colors rounded-control ${
                ep.id === selectedEpisodeId
                  ? "bg-accent/10 text-accent"
                  : "text-text hover:bg-surface-muted"
              } ${!ep.is_available ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="w-8 shrink-0 text-right text-sm tabular-nums text-text-muted">
                  {ep.number}
                </span>
                <div className="min-w-0">
                  <p className={`truncate text-sm font-medium ${ep.is_available ? "text-text" : "text-text-muted"}`}>
                    {ep.title || `Эпизод ${ep.number}`}
                  </p>
                  {!ep.is_available && (
                    <span className="text-xs text-text-muted">Недоступен</span>
                  )}
                </div>
              </div>
              {ep.id === selectedEpisodeId && (
                <svg className="w-5 h-5 text-accent shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderAllEpisodes = () => (
    <div className="divide-y divide-border">
      {episodes.map((ep) => (
        <button
          key={ep.id}
          onClick={() => onEpisodeChange(ep.id)}
          disabled={!ep.is_available}
          className={`flex items-center justify-between gap-3 p-2.5 w-full text-left transition-colors rounded-control ${
            ep.id === selectedEpisodeId
              ? "bg-accent/10 text-accent"
              : "text-text hover:bg-surface-muted"
          } ${!ep.is_available ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="w-8 shrink-0 text-right text-sm tabular-nums text-text-muted">
              {ep.number}
            </span>
            <div className="min-w-0">
              <p className={`truncate text-sm font-medium ${ep.is_available ? "text-text" : "text-text-muted"}`}>
                {ep.title || `Эпизод ${ep.number}`}
              </p>
              {!ep.is_available && (
                <span className="text-xs text-text-muted">Недоступен</span>
              )}
            </div>
          </div>
          {ep.id === selectedEpisodeId && (
            <svg className="w-5 h-5 text-accent shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
          )}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 p-3 border-b border-border bg-surface/95 backdrop-blur">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-text-muted">Эпизоды</h3>
      </div>

      {/* Episode list */}
      <div className="flex-1 overflow-y-auto p-3">
        {seasonKeys.length > 1
          ? seasonKeys.map(renderSeasonEpisodes)
          : renderAllEpisodes()}
      </div>

      {/* Progress section */}
      {libraryEntry && (
        <div className="border-t border-border p-3 bg-surface/50">
          <h4 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-text-muted">Прогресс</h4>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-[12px] text-text-muted mb-1">
                <span>Просмотрено эпизодов</span>
                <span className="font-medium text-text">{libraryEntry.progress_episode ?? 0} / {anime.total_episodes ?? "?"}</span>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${anime.total_episodes ? ((libraryEntry.progress_episode ?? 0) / anime.total_episodes) * 100 : 0}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max={anime.total_episodes ?? 1000}
                value={libraryEntry.progress_episode ?? 0}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 0;
                  onProgressChange(val);
                }}
                className="flex-1 px-3 py-2 text-[13px] border border-border rounded-control bg-bg text-text"
                aria-label="Текущий эпизод"
              />
              <span className="text-[13px] text-text-muted shrink-0">/ {anime.total_episodes ?? "?"}</span>
            </div>
            <select
              value={libraryEntry.status}
              onChange={(e) => onStatusChange(e.target.value as LibraryStatus)}
              className="w-full px-3 py-2 text-[13px] border border-border rounded-control bg-bg text-text"
            >
              <option value="plan_to_watch">Запланировано</option>
              <option value="watching">Смотрю</option>
              <option value="completed">Просмотрено</option>
              <option value="on_hold">На паузе</option>
              <option value="dropped">Брошено</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}