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
 * The library controls of an anime: status buttons and progress display.
 */
export function LibraryControls({
  status,
  progress,
  totalEpisodes,
  onStatusChange,
}: {
  status: LibraryStatus;
  progress: number;
  totalEpisodes?: number | null;
  onStatusChange: (status: LibraryStatus) => void;
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
      ))},

      {totalEpisodes && (
        <div className="ml-auto text-[13px] text-text-muted">
          Прогресс: {progress} / {totalEpisodes}
        </div>
      )}
    </div>
  );
}
