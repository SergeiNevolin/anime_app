"use client";

import { useState } from "react";

import { AnimeList } from "@/components/anime/anime-list";
import { AppShell } from "@/components/layout/app-shell";
import { ContinueWatchingList } from "@/components/library/continue-watching-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { useContinueWatching } from "@/features/library/hooks";
import { useAnimeSearch } from "@/features/search/hooks";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const DEBOUNCE_MS = 300;

/**
 * The home screen: a search field, the titles in progress and the results of
 * the search that is being typed.
 */
export default function HomePage() {
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedTerm = useDebouncedValue(term.trim(), DEBOUNCE_MS);

  const continueWatching = useContinueWatching();
  const search = useAnimeSearch(debouncedTerm, {
    page,
    pageSize: 20,
    enabled: debouncedTerm.length >= 2,
  });

  const items = search.data?.items ?? [];
  const hasMore = Boolean(search.data?.hasMore);
  const showResults = debouncedTerm.length >= 2 || search.isError;

  return (
    <AppShell title="Anime Watch" subtitle="Поиск и просмотр аниме">
      <section className="py-2">
        <SearchInput
          value={term}
          onChange={(value) => {
            setTerm(value);
            setPage(1);
          }}
          placeholder="Название аниме"
        />
      </section>

      {showResults ? (
        <section className="mt-5" aria-labelledby="search-results-heading">
          <h2
            id="search-results-heading"
            className="mb-2 border-b border-border pb-1.5 text-[13px] font-semibold uppercase tracking-wide text-text-muted"
          >
            {debouncedTerm
              ? `Результаты поиска «${debouncedTerm}»`
              : "Результаты поиска"}
          </h2>
          {search.isPending && items.length === 0 ? (
            <div className="flex flex-col gap-3 py-6" data-testid="search-skeleton">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : search.isError ? (
            <ErrorState
              title="Ошибка поиска"
              description={String(search.error ?? "Не удалось выполнить поиск")}
              onRetry={() => void search.refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title="Ничего не найдено"
              description="Попробуйте изменить запрос или проверить написание."
            />
          ) : (
            <>
              <AnimeList items={items} />
              {hasMore ? (
                <div className="pt-4">
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Показать ещё
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : (
        <section className="mt-5" aria-labelledby="continue-heading">
          <h2
            id="continue-heading"
            className="mb-2 border-b border-border pb-1.5 text-[13px] font-semibold uppercase tracking-wide text-text-muted"
          >
            Продолжить просмотр
          </h2>
          {continueWatching.isPending ? (
            <div className="flex flex-col gap-3 py-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <ContinueWatchingList items={continueWatching.data ?? []} limit={5} />
          )}
        </section>
      )}
    </AppShell>
  );
}
