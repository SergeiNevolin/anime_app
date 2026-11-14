import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatReleaseStatus } from "@/lib/utils/format";
import type { AnimeSummary } from "@/lib/api/types";

/**
 * The card of a single anime in a list.
 */
export function AnimeCard({ anime }: { anime: AnimeSummary }) {
  const href = anime.anime_id ? `/anime/${anime.anime_id}` : "/search";

  return (
    <Link
      href={href}
      className="group flex gap-3 border-b border-border py-3 last:border-b-0"
      data-testid="anime-card"
    >
      <div className="relative h-[92px] w-[62px] shrink-0 overflow-hidden rounded-control bg-surface-muted">
{anime.poster_url ? (
            <Image
              src={anime.poster_url}
              alt=""
              fill
              sizes="62px"
              quality={85}
              loading="lazy"
              className="object-cover"
            />
          ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium leading-snug text-text group-hover:text-accent">
          {anime.title}
        </p>
        {anime.original_title ? (
          <p className="truncate text-[12px] leading-snug text-text-muted">
            {anime.original_title}
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {anime.year ? <Badge>{anime.year}</Badge> : null}
          {anime.release_status && anime.release_status !== "unknown" ? (
            <Badge>{formatReleaseStatus(anime.release_status)}</Badge>
          ) : null}
          {anime.total_episodes ? (
            <Badge>{anime.total_episodes} эп.</Badge>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
