"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useCallback } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/features/auth/hooks";
import { useLibrary, useContinueWatching, useUpdateLibraryEntry, useRemoveFromLibrary } from "@/features/library/hooks";
import { formatEpisodeCount, formatReleaseStatus, formatLibraryStatus } from "@/lib/utils/format";
import type { LibraryStatus, LibraryItem } from "@/lib/api/types";

const STATUS_OPTIONS: { value: LibraryStatus; label: string }[] = [
  { value: "plan_to_watch", label: "Запланировано" },
  { value: "watching", label: "Смотрю" },
  { value: "completed", label: "Просмотрено" },
  { value: "on_hold", label: "На паузе" },
  { value: "dropped", label: "Брошено" },
];

export default function LibraryPage() {
  const { data: user } = useCurrentUser();
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [page, setPage] = useState(1);

  const { data, isPending, isError, error } = useLibrary(status, {
    page,
    pageSize: 20,
  });

  const continueWatching = useContinueWatching();
  const updateLibrary = useUpdateLibraryEntry();
  const removeFromLibrary = useRemoveFromLibrary();

  const items = data?.items ?? [];
  const total = data?.total ?? null;
  const hasMore = data?.hasMore ?? false;

  const handleStatusChange = useCallback(async (item: LibraryItem, newStatus: LibraryStatus) => {
    try {
      await updateLibrary.mutateAsync({ animeId: item.anime_id, status: newStatus });
    } catch {
      // Error handled by mutation
    }
  }, [updateLibrary]);

  const handleProgressChange = useCallback(async (item: LibraryItem, progress: number) => {
    try {
      await updateLibrary.mutateAsync({ animeId: item.anime_id, progressEpisode: progress });
    } catch {
      // Error handled by mutation
    }
  }, [updateLibrary]);

  const handleRemove = useCallback(async (animeId: string) => {
    try {
      await removeFromLibrary.mutateAsync({ animeId });
    } catch {
      // Error handled by mutation
    }
  }, [removeFromLibrary]);

  const handleLoadMore = useCallback(() => {
    if (hasMore) {
      setPage((p) => p + 1);
    }
  }, [hasMore]);

  if (!user) {
    return (
      <AppShell title="Библиотека">
        <EmptyState
          title="Требуется авторизация"
          description="Войдите через Telegram, чтобы пользоваться библиотекой."
        />
      </AppShell>
    );
  }

  if (isPending && items.length === 0 && continueWatching.isPending) {
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

  if (isError) {
    return (
      <AppShell title="Библиотека">
        <ErrorState
          title="Ошибка загрузки"
          description={error instanceof Error ? error.message : "Не удалось загрузить библиотеку"}
          onRetry={() => window.location.reload()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="Библиотека" subtitle={total !== null ? `${total} тайтлов` : undefined}>
      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Фильтр по статусу" role="tablist">
        <button
          role="tab"
          aria-selected={status === null}
          onClick={() => { setStatus(null); setPage(1); }}
          className={`px-3 py-1.5 text-[12px] rounded-control border transition-colors ${
            status === null
              ? "bg-accent text-accent-foreground border-accent"
              : "bg-surface text-text-muted border-border hover:bg-surface-muted"
          }`}
        >
          Все
        </button>
        {STATUS_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            role="tab"
            aria-selected={status === value}
            onClick={() => { setStatus(value); setPage(1); }}
            className={`px-3 py-1.5 text-[12px] rounded-control border transition-colors ${
              status === value
                ? "bg-accent text-accent-foreground border-accent"
                : "bg-surface text-text-muted border-border hover:bg-surface-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {continueWatching.data?.length && status !== "watching" && (
        <section className="mb-6" aria-labelledby="continue-heading">
          <h2 id="continue-heading" className="mb-3 border-b border-border pb-1.5 text-[13px] font-semibold uppercase tracking-wide text-text-muted">
            Продолжить просмотр
          </h2>
          <div className="flex flex-col">
            {continueWatching.data?.slice(0, 5).map((item: LibraryItem) => (
              <Link
                key={item.id}
                href={`/anime/${item.anime_id}`}
                className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0"
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
                  <p className="truncate text-[14px] text-text">{item.anime?.title ?? "Аниме"}</p>
                  <p className="text-[12px] text-text-muted">
                    Эпизод {item.progress_episode} из {formatEpisodeCount(item.anime?.total_episodes)}
                  </p>
                </div>
                <Badge tone="neutral">{formatLibraryStatus(item.status)}</Badge>
                <span aria-hidden="true" className="text-text-muted">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {items.length === 0 ? (
        <EmptyState
          title={status ? `Нет тайтлов со статусом «${STATUS_OPTIONS.find((s) => s.value === status)?.label}»` : "Библиотека пуста"}
          description="Добавьте аниме через поиск или карточку тайтла, чтобы оно появилось здесь."
        />
      ) : (
        <>
          <div className="flex flex-col" data-testid="library-list">
            {items.map((item: LibraryItem) => (
              <div key={item.id} className="border-b border-border last:border-b-0">
                <div className="flex gap-3 py-3">
                  <div className="relative h-[92px] w-[62px] shrink-0 overflow-hidden rounded-control bg-surface-muted">
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
                    <Link
                      href={`/anime/${item.anime_id}`}
                      className="truncate text-[14px] font-medium leading-snug text-text hover:text-accent block"
                    >
                      {item.anime?.title ?? "Аниме"}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {item.anime?.year && <Badge>{item.anime.year}</Badge>}
                      {item.anime?.release_status && item.anime.release_status !== "unknown" && (
                        <Badge>{formatReleaseStatus(item.anime.release_status)}</Badge>
                      )}
                      {item.anime?.total_episodes && (
                        <Badge>{formatEpisodeCount(item.anime.total_episodes)}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <select
                      value={item.status}
                      onChange={(e) => handleStatusChange(item, e.target.value as LibraryStatus)}
                      disabled={updateLibrary.isPending}
                      className="px-2 py-1 text-[12px] border border-border rounded-control bg-surface text-text"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    {item.anime?.total_episodes && item.anime.total_episodes > 0 && (
                      <input
                        type="number"
                        min="0"
                        max={item.anime.total_episodes}
                        value={item.progress_episode}
                        onChange={(e) => handleProgressChange(item, parseInt(e.target.value, 10) || 0)}
                        disabled={updateLibrary.isPending}
                        className="w-20 px-2 py-1 text-[12px] border border-border rounded-control bg-surface text-text"
                        aria-label="Прогресс просмотра"
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(item.anime_id)}
                      disabled={removeFromLibrary.isPending}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      Удалить
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="mt-4 text-center">
              <Button
                variant="secondary"
                onClick={handleLoadMore}
                className="w-full sm:w-auto"
              >
                Загрузить ещё
              </Button>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}