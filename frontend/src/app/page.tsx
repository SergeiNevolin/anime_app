"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, Suspense } from "react";

import { AnimeList } from "@/components/anime/anime-list";
import { AppShell } from "@/components/layout/app-shell";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useContinueWatching } from "@/features/library/hooks";
import { useAnimeSearch } from "@/features/search/hooks";

const DEBOUNCE_MS = 300;

function HomePageContent() {
  const [term, setTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const continueWatching = useContinueWatching();

  const { data, isPending, isError, error } = useAnimeSearch(debouncedTerm, {
    page: 1,
    pageSize: 20,
    enabled: debouncedTerm.length >= 2,
  });

  const items = data?.items ?? [];

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedTerm(term.trim());
    }, DEBOUNCE_MS);
    return () => clearTimeout(handler);
  }, [term]);

  return (
    <AppShell title="Anime Watch">
      <section className="py-2">
        <SearchInput
          value={term}
          onChange={setTerm}
          placeholder="Название аниме"
          autoFocus
        />
      </section>

      {debouncedTerm.length >= 2 && (
        <section className="mt-5" aria-labelledby="search-results-heading">
          <h2
            id="search-results-heading"
            className="mb-2 border-b border-border pb-1.5 text-[13px] font-semibold uppercase tracking-wide text-text-muted"
          >
            Результаты поиска {debouncedTerm ? `«${debouncedTerm}»` : ""} {data?.total ? `· ${data.total} найдено` : ""}
          </h2>
          {isPending && items.length === 0 ? (
            <div className="flex flex-col gap-3 py-8">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : isError ? (
            <ErrorState
              title="Ошибка поиска"
              description={error instanceof Error ? error.message : "Не удалось выполнить поиск"}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title="Ничего не найдено"
              description="Попробуйте изменить запрос или проверьте написание."
            />
          ) : (
            <AnimeList items={items} />
          )}
        </section>
      )}

      {debouncedTerm.length < 2 && (
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
      )}
    </AppShell>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center">Загрузка…</div>}>
      <HomePageContent />
    </Suspense>
  );
}