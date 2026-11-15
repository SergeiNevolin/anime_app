"use client";

import { Button } from "@/components/ui/button";
import { formatLibraryStatus } from "@/lib/utils/format";
import type { LibraryStatus } from "@/lib/api/types";

const STATUSES: LibraryStatus[] = [
  "plan_to_watch",
  "watching",
  "completed",
  "on_hold",
  "dropped",
];

/**
 * The library controls of an anime: status buttons and the progress field.
 */
export function LibraryControls({
  status,
  progress,
  totalEpisodes,
  onStatusChange,
  onProgressChange,
}: {
  status: LibraryStatus;
  progress: number;
  totalEpisodes?: number | null;
  onStatusChange: (status: LibraryStatus) => void;
  onProgressChange: (progress: number) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
      {STATUSES.map((item) => (
        <Button
          key={item}
          variant={status === item ? "primary" : "secondary"}
          size="sm"
          onClick={() => onStatusChange(item)}
        >
          {formatLibraryStatus(item)}
        </Button>
      ))}

      <div className="ml-auto flex items-center gap-2">
        <label htmlFor="anime-progress" className="text-[13px] text-text-muted">
          Прогресс:
        </label>
        <input
          id="anime-progress"
          type="number"
          min={0}
          max={totalEpisodes ?? undefined}
          value={progress}
          onChange={(event) => {
            const value = Number.parseInt(event.target.value, 10);
            if (!Number.isNaN(value) && value >= 0) {
              onProgressChange(value);
            }
          }}
          className="w-20 rounded-control border border-border bg-surface px-2 py-1 text-[13px] text-text focus:border-accent focus:outline-none"
        />
        {totalEpisodes ? (
          <span className="text-[13px] text-text-muted">/ {totalEpisodes}</span>
        ) : null}
      </div>
    </div>
  );
}
