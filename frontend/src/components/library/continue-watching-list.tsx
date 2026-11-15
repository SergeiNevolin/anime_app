"use client";

import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { LibraryItem } from "@/lib/api/types";
import { formatEpisodeCount, formatLibraryStatus } from "@/lib/utils/format";

/**
 * The titles the user started to watch.
 *
 * The list is shown on the home screen and in the library, so it lives in its
 * own component.
 */
export function ContinueWatchingList({
  items,
  limit,
}: {
  items: LibraryItem[];
  limit?: number;
}) {
  const visible = limit ? items.slice(0, limit) : items;

  if (!visible.length) {
    return (
      <p className="py-4 text-[13px] text-text-muted">
        Здесь появятся тайтлы, которые вы начали смотреть.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border" data-testid="continue-list">
      {visible.map((item) => (
        <li key={item.id}>
          <Link
            href={`/anime/${item.anime_id}`}
            className="flex items-center gap-3 py-2.5"
          >
            <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-control bg-surface-muted">
              {item.anime?.poster_url ? (
                <Image
                  src={item.anime.poster_url}
                  alt=""
                  fill
                  sizes="40px"
                  quality={85}
                  className="object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] text-text">
                {item.anime?.title ?? "Аниме"}
              </p>
              <p className="text-[12px] text-text-muted">
                Эпизод {item.progress_episode} из{" "}
                {formatEpisodeCount(item.anime?.total_episodes)}
              </p>
            </div>
            <Badge>{formatLibraryStatus(item.status)}</Badge>
            <span aria-hidden="true" className="text-text-muted">
              ›
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
