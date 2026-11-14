import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import type { AnimeDetails } from "@/lib/api/types";
import {
  formatEpisodeCount,
  formatReleaseStatus,
} from "@/lib/utils/format";

/**
 * The header of the anime card: poster, titles and the short facts.
 */
export function AnimeDetailsHeader({ anime }: { anime: AnimeDetails }) {
  return (
    <section className="flex gap-4">
      <div className="relative h-[168px] w-[112px] shrink-0 overflow-hidden rounded-control bg-surface-muted">
{anime.poster_url ? (
            <Image
              src={anime.poster_url}
              alt={anime.title}
              fill
              sizes="112px"
              quality={90}
              priority
              className="object-cover"
            />
          ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <h2 className="text-[17px] font-semibold leading-tight text-text">
          {anime.title}
        </h2>
        {anime.original_title ? (
          <p className="mt-0.5 text-[13px] leading-snug text-text-muted">
            {anime.original_title}
          </p>
        ) : null}
        {anime.alternative_title &&
        anime.alternative_title !== anime.original_title ? (
          <p className="text-[13px] leading-snug text-text-muted">
            {anime.alternative_title}
          </p>
        ) : null}

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
          <dt className="text-text-muted">Год</dt>
          <dd className="text-text">{anime.year ?? "—"}</dd>
          <dt className="text-text-muted">Эпизоды</dt>
          <dd className="text-text">{formatEpisodeCount(anime.total_episodes)}</dd>
          <dt className="text-text-muted">Статус</dt>
          <dd className="text-text">
            {formatReleaseStatus(anime.release_status)}
          </dd>
          {anime.dubbing_teams && anime.dubbing_teams.length ? (
            <>
              <dt className="text-text-muted">Озвучка</dt>
              <dd className="truncate text-text">
                {anime.dubbing_teams.join(", ")}
              </dd>
            </>
          ) : null}
        </dl>

        {anime.genres && anime.genres.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {anime.genres.map((genre) => (
              <Badge key={genre.name}>{genre.name}</Badge>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
