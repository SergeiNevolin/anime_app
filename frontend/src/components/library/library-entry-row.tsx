"use client";

import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LibraryItem, LibraryStatus } from "@/lib/api/types";
import {
  formatEpisodeCount,
  formatLibraryStatus,
  formatReleaseStatus,
} from "@/lib/utils/format";

const STATUS_OPTIONS: Array<{ value: LibraryStatus; label: string }> = [
  { value: "plan_to_watch", label: "Запланировано" },
  { value: "watching", label: "Смотрю" },
  { value: "completed", label: "Просмотрено" },
  { value: "on_hold", label: "На паузе" },
  { value: "dropped", label: "Брошено" },
];

/**
 * A single entry of the personal library.
 *
 * It exposes the status and the progress of the entry, so the user can update
 * them without leaving the page.
 */
export function LibraryEntryRow({
  entry,
  disabled,
  onStatusChange,
  onProgressChange,
  onRemove,
}: {
  entry: LibraryItem;
  disabled?: boolean;
  onStatusChange: (status: LibraryStatus) => void;
  onProgressChange: (progress: number) => void;
  onRemove: () => void;
}) {
  const anime = entry.anime;
  const totalEpisodes = anime?.total_episodes ?? 0;

  return (
    <div className="flex gap-3 border-b border-border py-3 last:border-b-0">
      <div className="relative h-[92px] w-[62px] shrink-0 overflow-hidden rounded-control bg-surface-muted">
        {anime?.poster_url ? (
          <Image
            src={anime.poster_url}
            alt=""
            fill
            sizes="62px"
            quality={85}
            className="object-cover"
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <Link
          href={`/anime/${entry.anime_id}`}
          className="block truncate text-[14px] font-medium leading-snug text-text hover:text-accent"
        >
          {anime?.title ?? "Аниме"}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge>{formatLibraryStatus(entry.status)}</Badge>
          {anime?.year ? <Badge>{anime.year}</Badge> : null}
          {anime?.release_status && anime.release_status !== "unknown" ? (
            <Badge>{formatReleaseStatus(anime.release_status)}</Badge>
          ) : null}
          {anime?.total_episodes ? (
            <Badge>{formatEpisodeCount(anime.total_episodes)}</Badge>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <select
          value={entry.status}
          onChange={(event) => onStatusChange(event.target.value as LibraryStatus)}
          disabled={disabled}
          aria-label="Статус просмотра"
          className="rounded-control border border-border bg-surface px-2 py-1 text-[12px] text-text focus:border-accent focus:outline-none disabled:opacity-50"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* The number of episodes is not part of the stored catalogue, so the
            field is always available and the upper bound is optional. */}
        <input
          type="number"
          min={0}
          max={totalEpisodes > 0 ? totalEpisodes : undefined}
          value={entry.progress_episode}
          onChange={(event) => {
            const value = Number.parseInt(event.target.value, 10);
            if (!Number.isNaN(value) && value >= 0) {
              onProgressChange(value);
            }
          }}
          disabled={disabled}
          aria-label="Прогресс просмотра"
          className="w-20 rounded-control border border-border bg-surface px-2 py-1 text-[12px] text-text focus:border-accent focus:outline-none disabled:opacity-50"
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={disabled}
          className="text-danger hover:bg-danger/10"
        >
          Удалить
        </Button>
      </div>
    </div>
  );
}
