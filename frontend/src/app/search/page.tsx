"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, Suspense } from "react";

import { AnimeList } from "@/components/anime/anime-list";
import { AppShell } from "@/components/layout/app-shell";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { useAnimeSearch } from "@/features/search/hooks";

const DEBOUNCE_MS = 300;

function SearchPageContent() {
  const searchParams = useSearchParams();
  const [term, setTerm] = useState(searchParams.get("q") ?? "");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedTerm(term.trim());
      setPage(1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handler);
  }, [term]);

  const { data, isPending, isError, error } = useAnimeSearch(debouncedTerm, {
    page,
    pageSize: 20,
    enabled: debouncedTerm.length >= 2,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? null;
  const hasMore = data?.hasMore ?? false;

  const handleLoadMore = useCallback(() => {
    if (hasMore) {
      setPage((p) => p + 1);
    }
  }, [hasMore]);

  if (debouncedTerm.length < 2) {
    return (
      <AppShell title="Поиск" subtitle="Найдите аниме по названию">
        <section className="py-2">
          <SearchInput
            value={term}
            onChange={setTerm}
            placeholder="Название аниме"
            autoFocus
          />
        </section>
        <EmptyState
          title="Введите запрос для поиска"
          description="Минимум 2 символа. Поиск работает по всем подключенным каталогам."
        />
      </AppShell>
    );
  }

  if (isPending && items.length === 0) {
    return (
      <AppShell title="Поиск" subtitle={`Результаты для «${debouncedTerm}»`} back>
        <section className="py-2">
          <SearchInput
            value={term}
            onChange={setTerm}
            placeholder="Название аниме"
          />
        </section>
        <div className="flex flex-col gap-3 py-8">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell title="Поиск" subtitle={`Результаты для «${debouncedTerm}»`} back>
        <section className="py-2">
          <SearchInput
            value={term}
            onChange={setTerm}
            placeholder="Название аниме"
          />
        </section>
        <ErrorState
          title="Ошибка поиска"
          description={error instanceof Error ? error.message : "Не удалось выполнить поиск"}
          onRetry={() => window.location.reload()}
        />
      </AppShell>
    );
  }

  if (items.length === 0) {
    return (
      <AppShell title="Поиск" subtitle={`Результаты для «${debouncedTerm}»`} back>
        <section className="py-2">
          <SearchInput
            value={term}
            onChange={setTerm}
            placeholder="Название аниме"
          />
        </section>
        <EmptyState
          title="Ничего не найдено"
          description="Попробуйте изменить запрос или проверьте написание."
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Поиск"
      subtitle={`Результаты для «${debouncedTerm}»${total ? ` · ${total} найдено` : ""}`}
      back
    >
      <section className="py-2">
        <SearchInput
          value={term}
          onChange={setTerm}
          placeholder="Название аниме"
        />
      </section>
      <AnimeList items={items} />
      {hasMore && (
        <div className="mt-4 text-center">
          <Button variant="secondary" onClick={handleLoadMore} className="w-full sm:w-auto">
            Загрузить ещё
          </Button>
        </div>
      )}
    </AppShell>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center">Загрузка…</div>}>
      <SearchPageContent />
    </Suspense>
  );
}