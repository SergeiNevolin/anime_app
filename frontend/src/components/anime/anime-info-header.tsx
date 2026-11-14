"use client";

import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatEpisodeCount, formatReleaseStatus, formatLibraryStatus } from "@/lib/utils/format";
import type { LibraryStatus, LibraryItem } from "@/lib/api/types";

interface AnimeInfoHeaderProps {
  anime: {
    title: string;
    original_title?: string | null;
    poster_url?: string | null;
    year?: number | null;
    release_status?: string | null;
    total_episodes?: number | null;
    genres?: { name: string }[] | null;
    dubbing_teams?: string[] | null;
    description?: string | null;
  };
  animeId: string;
  firstEpisode: { id: string } | null;
  libraryEntry: LibraryItem | null | undefined;
  libraryStatus: LibraryStatus;
  isInLibrary: boolean;
  onStatusChange: (status: LibraryStatus) => void;
  onProgressChange: (progress: number) => void;
  onAddToLibrary: () => void;
  expanded: boolean;
  onToggleExpand: (expanded: boolean) => void;
}

export function AnimeInfoHeader({
  anime,
  animeId,
  firstEpisode,
  libraryEntry,
  libraryStatus,
  isInLibrary,
  onStatusChange,
  onProgressChange,
  onAddToLibrary,
  expanded,
  onToggleExpand,
}: AnimeInfoHeaderProps) {
  const shortDescription = anime.description
    ? anime.description.slice(0, 200) + (anime.description.length > 200 ? "…" : "")
    : null;

  return (
    <section className="relative px-4 py-4 md:py-6 bg-gradient-to-b from-surface via-surface/50 to-transparent">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 md:gap-6">
          {/* Poster */}
          <div className="relative w-full md:w-[160px] shrink-0">
            <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-xl bg-surface-muted">
              {anime.poster_url ? (
                <Image
                  src={anime.poster_url}
                  alt={anime.title}
                  fill
                  priority
                  sizes="(max-width: 768px) 100vw, 160px"
                  quality={90}
                  className="object-cover transition-transform duration-300 hover:scale-[1.02]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-text-muted">
                  Нет обложки
                </div>
              )}
            </div>
          </div>

          {/* Info & Actions */}
          <div className="flex flex-1 flex-col min-w-0">
            <div className="flex flex-col gap-2 md:gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {anime.year && <Badge>{anime.year}</Badge>}
                {anime.release_status && anime.release_status !== "unknown" && (
                  <Badge tone={anime.release_status === "ongoing" ? "accent" : "neutral"}>
                    {formatReleaseStatus(anime.release_status)}
                  </Badge>
                )}
                {anime.total_episodes && <Badge>{formatEpisodeCount(anime.total_episodes)}</Badge>}
              </div>

              <h1 className="text-xl md:text-2xl font-bold leading-tight text-text truncate">
                {anime.title}
              </h1>

              {anime.original_title && anime.original_title !== anime.title && (
                <p className="text-sm text-text-muted truncate">{anime.original_title}</p>
              )}

              {anime.genres && anime.genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {anime.genres.slice(0, 6).map((genre) => (
                    <Badge key={genre.name} tone="neutral" className="text-[11px]">
                      {genre.name}
                    </Badge>
                  ))}
                  {anime.genres.length > 6 && (
                    <Badge tone="neutral" className="text-[11px]">
                      +{anime.genres.length - 6}
                    </Badge>
                  )}
                </div>
              )}

              {anime.dubbing_teams && anime.dubbing_teams.length > 0 && (
                <p className="text-sm text-text-muted">Озвучка: {anime.dubbing_teams.slice(0, 3).join(", ")}</p>
              )}
            </div>

            {/* Description */}
            {anime.description && (
              <div className="mt-3 flex-1">
                <p className={`${expanded ? "" : "line-clamp-3"} text-sm text-text/90 whitespace-pre-line transition-all duration-200`}>
                  {expanded ? anime.description : shortDescription}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-accent hover:underline p-0"
                  onClick={() => onToggleExpand(!expanded)}
                >
                  {expanded ? "Скрыть" : "Читать полностью"}
                </Button>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2 mt-4 pt-2 border-t border-border">
              <Button
                variant="primary"
                className="flex-1 sm:w-auto px-4 py-2"
                onClick={() => window.location.href = `/anime/${animeId}/watch/${firstEpisode?.id}`}
              >
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {libraryEntry ? "Продолжить просмотр" : "Начать просмотр"}
              </Button>

              {!isInLibrary && (
                <Button
                  variant="secondary"
                  className="flex-1 sm:w-auto px-4 py-2"
                  onClick={onAddToLibrary}
                >
                  В библиотеку
                </Button>
              )}

              {isInLibrary && (
                <Button
                  variant="secondary"
                  className="flex-1 sm:w-auto px-4 py-2"
                  onClick={() => onStatusChange("watching")}
                >
                  {formatLibraryStatus(libraryStatus)}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Library status badges for logged in users */}
        {libraryEntry && (
          <div className="mt-4 flex flex-wrap gap-2">
            {["plan_to_watch", "watching", "completed", "on_hold", "dropped"].map((status) => (
              <Button
                key={status}
                variant={libraryStatus === status ? "primary" : "secondary"}
                size="sm"
                onClick={() => onStatusChange(status as LibraryStatus)}
              >
                {formatLibraryStatus(status)}
              </Button>
            ))}

            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-text-muted">Прогресс:</span>
              <input
                type="number"
                min="0"
                max={anime.total_episodes ?? 1000}
                value={libraryEntry.progress_episode ?? 0}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 0;
                  onProgressChange(val);
                }}
                className="w-20 px-2 py-1.5 text-sm border border-border rounded-control bg-surface text-text"
              />
              {anime.total_episodes && (
                <span className="text-sm text-text-muted">/ {anime.total_episodes}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}