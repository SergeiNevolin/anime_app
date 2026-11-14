import type { ReactNode } from "react";

/**
 * The message shown when a list has no items.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="text-[15px] font-medium text-text">{title}</p>
      {description ? (
        <p className="max-w-xs text-[13px] leading-relaxed text-text-muted">
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}
