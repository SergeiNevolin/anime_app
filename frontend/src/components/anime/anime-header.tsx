import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import type { AnimeDetails } from "@/lib/api/types";
import {
  formatEpisodeCount,
  formatReleaseStatus,
} from "@/lib/utils/format";

const DESCRIPTION_PREVIEW_LENGTH = 200;

/**
 * The header of an anime: poster, titles, short facts and description.
 *
 * It only renders what it knows: every optional value is skipped when the
 * provider did not supply it.
 */
export function AnimeHeader({
  anime,
  expanded,
  onToggleExpand,
}: {
  anime: AnimeDetails;
  expanded: boolean;
  onToggleExpand: (expanded: boolean) => void;
}) {
  const genres = anime.genres ?? [];
  const dubbingTeams = anime.dubbing_teams ?? [];
  const description = anime.description ?? null;

  return (
    <div className="flex flex-row gap-4 sm:gap-6">
      <div className="shrink-0 w-[112px] sm:w-[140px]">
        {/* The container has to be positioned, otherwise the absolutely
            positioned image covers the whole page. */}
        <div className="relative aspect-[2/3] overflow-hidden rounded-control bg-surface-muted">
          {anime.poster_url ? (
            <Image
              src={anime.poster_url}
              alt={anime.title}
              fill
              priority
              sizes="(max-width: 640px) 140px, 160px"
              quality={90}
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[12px] text-text-muted">
              Нет обложки
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="accent" className="font-medium">{anime.provider}</Badge>
            {anime.year ? <Badge>{anime.year}</Badge> : null}
            {anime.release_status && anime.release_status !== "unknown" ? (
              <Badge
                tone={anime.release_status === "ongoing" ? "accent" : "neutral"}
              >
                {formatReleaseStatus(anime.release_status)}
              </Badge>
            ) : null}
            {anime.total_episodes ? (
              <Badge>{formatEpisodeCount(anime.total_episodes)}</Badge>
            ) : null}
          </div>

          {/* The page title is rendered by the shell, so the title of the
              title itself is a second level heading. */}
          <h2 className="truncate text-lg font-semibold leading-tight text-text sm:text-xl">
            {anime.title}
          </h2>

          {anime.original_title && anime.original_title !== anime.title ? (
            <p className="truncate text-[13px] text-text-muted">
              {anime.original_title}
            </p>
          ) : null}

          {genres.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {genres.slice(0, 6).map((genre) => (
                <Badge key={genre.name}>{genre.name}</Badge>
              ))}
              {genres.length > 6 ? <Badge>+{genres.length - 6}</Badge> : null}
            </div>
          ) : null}

          {dubbingTeams.length > 0 ? (
            <p className="text-[13px] text-text-muted">
              Озвучка: {dubbingTeams.slice(0, 3).join(", ")}
            </p>
          ) : null}
        </div>

        {description ? (
          <div className="mt-3 flex-1">
            <p
              className={`whitespace-pre-line text-[13px] leading-relaxed text-text ${
                expanded ? "" : "line-clamp-3"
              }`}
            >
              {expanded
                ? description
                : `${description.slice(0, DESCRIPTION_PREVIEW_LENGTH)}${
                    description.length > DESCRIPTION_PREVIEW_LENGTH ? "…" : ""
                  }`}
            </p>
            <button
              type="button"
              onClick={() => onToggleExpand(!expanded)}
              className="mt-1 p-0 text-[13px] text-accent hover:underline"
            >
              {expanded ? "Скрыть" : "Читать полностью"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
