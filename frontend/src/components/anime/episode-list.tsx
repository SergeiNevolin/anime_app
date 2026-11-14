"use client";

import { cn } from "@/lib/utils/cn";
import type { AnimeEpisode } from "@/lib/api/types";

/**
 * The list of episodes of a title.
 */
export function EpisodeList({
  episodes,
  selectedId,
  onSelect,
}: {
  episodes: AnimeEpisode[];
  selectedId?: string | null;
  onSelect: (episode: AnimeEpisode) => void;
}) {
  return (
    <ul className="divide-y divide-border" data-testid="episode-list">
      {episodes.map((episode) => {
        const active = episode.id === selectedId;
        return (
          <li key={episode.id}>
            <button
              type="button"
              onClick={() => onSelect(episode)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors",
                active ? "text-accent" : "text-text hover:bg-surface-muted",
              )}
            >
              <span className="w-8 shrink-0 text-[13px] tabular-nums text-text-muted">
                {episode.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {episode.title || `Эпизод ${episode.number}`}
              </span>
              {!episode.is_available ? (
                <span className="text-[11px] text-text-muted">недоступен</span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
