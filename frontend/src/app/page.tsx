"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AnimeList } from "@/components/anime/anime-list";
import { AppShell } from "@/components/layout/app-shell";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { useContinueWatching } from "@/features/library/hooks";
import { useOngoingAnime } from "@/features/anime/hooks";

/**
 * The home screen: a search field, the titles in progress and the titles
 * that are currently airing.
 */
export default function HomePage() {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const continueWatching = useContinueWatching();
  const ongoing = useOngoingAnime();

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length >= 2) {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  return (
    <AppShell title="Anime Watch" subtitle="Поиск и просмотр аниме">
      <section className="py-2">
        <SearchInput
          value={term}
          onChange={setTerm}
          onSubmit={submit}
          placeholder="Название аниме"
        />
      </section>

      <section className="mt-5" aria-labelledby="continue-heading">
        <h2
          id="continue-heading"
          className="mb-1 border-b border-border pb-1.5 text-[13px] font-semibold uppercase tracking-wide text-text-muted"
        >
          Продолжить просмотр
        </h2>
        {continueWatching.isPending ? (
          <div className="flex flex-col gap-3 py-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : continueWatching.data?.length ? (
          <ul className="divide-y divide-border" data-testid="continue-list">
            {continueWatching.data.map((item) => (
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
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-text">
                      {item.anime?.title ?? "Аниме"}
                    </p>
                    <p className="text-[12px] text-text-muted">
                      {item.progress_episode} эп.
                    </p>
                  </div>
                  <span aria-hidden="true" className="text-text-muted">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-[13px] text-text-muted">
            Здесь появятся тайтлы, которые вы начали смотреть.
          </p>
        )}
      </section>

      <section className="mt-6" aria-labelledby="ongoing-heading">
        <h2
          id="ongoing-heading"
          className="mb-1 border-b border-border pb-1.5 text-[13px] font-semibold uppercase tracking-wide text-text-muted"
        >
          Сейчас выходят
        </h2>
        {ongoing.isPending ? (
          <div className="flex flex-col gap-3 py-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : ongoing.data?.length ? (
          <AnimeList items={ongoing.data} />
        ) : (
          <p className="py-4 text-[13px] text-text-muted">
            Источник с обновляемым каталогом сейчас недоступен.
          </p>
        )}
      </section>
    </AppShell>
  );
}
