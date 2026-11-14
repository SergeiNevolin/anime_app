"use client";

import { Button } from "@/components/ui/button";

/**
 * The message shown when a request failed.
 */
export function ErrorState({
  title = "Не удалось загрузить данные",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="text-[15px] font-medium text-text">{title}</p>
      {description ? (
        <p className="max-w-xs text-[13px] leading-relaxed text-text-muted">
          {description}
        </p>
      ) : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Повторить
        </Button>
      ) : null}
    </div>
  );
}
