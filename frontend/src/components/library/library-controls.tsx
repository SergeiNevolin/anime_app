"use client";

import { Button } from "@/components/ui/button";
import type { LibraryStatus } from "@/lib/api/types";

const STATUSES: LibraryStatus[] = [
  "plan_to_watch",
  "watching",
  "completed",
  "on_hold",
  "dropped",
];

// Compact labels for the status buttons
const COMPACT_LABELS: Record<LibraryStatus, string> = {
  plan_to_watch: "Планы",
  watching: "Смотрю",
  completed: "Готово",
  on_hold: "Пауза",
  dropped: "Брошено",
};

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
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
      {STATUSES.map((item) => (
        <Button
          key={item}
          variant={status === item ? "primary" : "secondary"}
          size="sm"
          onClick={() => onStatusChange(item)}
          className="px-2 py-1 h-7 text-[11px]"
        >
          {COMPACT_LABELS[item]}
        </Button>
      ))}

      {totalEpisodes && (
        <div className="ml-auto text-[11px] text-text-muted">
          {progress} / {totalEpisodes}
        </div>
      )}
    </div>
  );
}
