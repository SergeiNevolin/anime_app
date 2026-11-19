"use client";

import { useCallback, useState } from "react";

import { ContinueWatchingList } from "@/components/library/continue-watching-list";
import { LibraryEntryRow } from "@/components/library/library-entry-row";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { GUEST_TELEGRAM_ID, useCurrentUser } from "@/features/auth/hooks";
import {
  useContinueWatching,
  useLibrary,
  useRemoveFromLibrary,
  useUpdateLibraryEntry,
} from "@/features/library/hooks";
import type { LibraryItem, LibraryStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";

const STATUS_FILTERS: Array<{ value: LibraryStatus | null; label: string }> = [
  { value: null, label: "Все" },
  { value: "plan_to_watch", label: "Запланировано" },
  { value: "watching", label: "Смотрю" },
  { value: "completed", label: "Просмотрено" },
  { value: "on_hold", label: "На паузе" },
  { value: "dropped", label: "Брошено" },
];

/**
 * The personal library page.
 *
 * The page only composes the sections: the data lives in the hooks of the
 * library feature.
 */
export default function LibraryPage() {
  const { data: user } = useCurrentUser();
  const isGuest = user?.telegram_id === GUEST_TELEGRAM_ID;
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [page, setPage] = useState(1);

  const library = useLibrary(status, { page, pageSize: 20 });
  const continueWatching = useContinueWatching();
  const updateLibrary = useUpdateLibraryEntry();
  const removeFromLibrary = useRemoveFromLibrary();

  const items = library.data?.items ?? [];
  const total = library.data?.total ?? null;
  const hasMore = library.data?.hasMore ?? false;

  const handleStatusChange = useCallback(
    (item: LibraryItem, nextStatus: LibraryStatus) => {
      void updateLibrary.mutateAsync({ animeId: item.anime_id, status: nextStatus });
    },
    [updateLibrary],
  );

  const handleProgressChange = useCallback(
    (item: LibraryItem, progress: number) => {
      void updateLibrary.mutateAsync({
        animeId: item.anime_id,
        progressEpisode: progress,
      });
    },
    [updateLibrary],
  );

  const handleRemove = useCallback(
    (animeId: string) => {
      void removeFromLibrary.mutateAsync({ animeId });
    },
    [removeFromLibrary],
  );

  if (library.isPending && items.length === 0) {
    return (
      <AppShell title="Библиотека">
        <div className="flex flex-col gap-4 py-8">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </AppShell>
    );
  }

  if (library.isError) {
    return (
      <AppShell title="Библиотека">
        <ErrorState
          title="Ошибка загрузки"
          description={String(library.error ?? "Не удалось загрузить библиотеку")}
          onRetry={() => void library.refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Библиотека"
      subtitle={total !== null ? `${total} тайтлов` : undefined}
    >
      <nav
        aria-label="Фильтр по статусу"
        role="tablist"
        className="mb-4 flex flex-wrap gap-1"
      >
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value ?? "all"}
            role="tab"
            type="button"
            aria-selected={status === filter.value}
            onClick={() => {
              setStatus(filter.value);
              setPage(1);
            }}
            className={cn(
              "rounded-control border px-3 py-1.5 text-[12px] transition-colors",
              status === filter.value
                ? "border-accent bg-accent text-accent-contrast"
                : "border-border bg-surface text-text-muted hover:bg-surface-muted",
            )}
          >
            {filter.label}
          </button>
        ))}
      </nav>

      {continueWatching.data?.length && status !== "watching" ? (
        <section className="mb-6" aria-labelledby="continue-heading">
          <h2
            id="continue-heading"
            className="mb-3 border-b border-border pb-1.5 text-[13px] font-semibold uppercase tracking-wide text-text-muted"
          >
            Продолжить просмотр
          </h2>
          <ContinueWatchingList items={continueWatching.data} limit={5} />
        </section>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title={
            status
              ? `Нет тайтлов со статусом «${
                  STATUS_FILTERS.find((item) => item.value === status)?.label ?? ""
                }»`
              : "Библиотека пуста"
          }
          description="Добавьте аниме через поиск или карточку тайтла, чтобы оно появилось здесь."
        />
      ) : (
        <>
          <div className="flex flex-col" data-testid="library-list">
            {items.map((item: LibraryItem) => (
              <LibraryEntryRow
                key={item.id}
                entry={item}
                disabled={updateLibrary.isPending || removeFromLibrary.isPending}
                onStatusChange={(nextStatus) => handleStatusChange(item, nextStatus)}
                onProgressChange={(progress) => handleProgressChange(item, progress)}
                onRemove={() => handleRemove(item.anime_id)}
              />
            ))}
          </div>

          {hasMore ? (
            <div className="mt-4">
              <Button
                variant="secondary"
                onClick={() => setPage((current) => current + 1)}
                className="w-full"
              >
                Загрузить ещё
              </Button>
            </div>
          ) : null}
        </>
      )}

      {isGuest ? (
        <p className="mt-4 text-center text-[12px] text-text-muted">
          Войдите через Telegram, чтобы библиотека синхронизировалась между
          устройствами.
        </p>
      ) : null}
    </AppShell>
  );
}
