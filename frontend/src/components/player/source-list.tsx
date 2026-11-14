"use client";

import { cn } from "@/lib/utils/cn";
import type { EpisodeSource } from "@/lib/api/types";

/**
 * The list of the playable sources of an episode.
 */
export function SourceList({
  sources,
  selectedKey,
  onSelect,
}: {
  sources: EpisodeSource[];
  selectedKey?: string | null;
  onSelect: (source: EpisodeSource) => void;
}) {
  if (!sources.length) {
    return (
      <p className="px-1 py-3 text-[13px] text-text-muted">
        Для этого эпизода нет доступных источников.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border" data-testid="source-list">
      {sources.map((source) => {
        const active = source.key === selectedKey;
        return (
          <li key={source.key}>
            <button
              type="button"
              onClick={() => onSelect(source)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-1 py-2.5 text-left transition-colors",
                active ? "text-accent" : "text-text hover:bg-surface-muted",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {source.title}
              </span>
              <span className="shrink-0 text-[11px] text-text-muted">
                {source.player}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
