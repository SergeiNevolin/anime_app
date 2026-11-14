import { AnimeCard } from "@/components/anime/anime-card";
import type { AnimeSummary } from "@/lib/api/types";

/**
 * A compact list of anime cards.
 */
export function AnimeList({ items }: { items: AnimeSummary[] }) {
  return (
    <div className="flex flex-col" data-testid="anime-list">
      {items.map((anime) => (
        <AnimeCard key={`${anime.provider}-${anime.external_id}`} anime={anime} />
      ))}
    </div>
  );
}
