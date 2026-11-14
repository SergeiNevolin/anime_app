import { cn } from "@/lib/utils/cn";

/** A placeholder block shown while the content is loading. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-control bg-surface-muted", className)}
    />
  );
}

/** A skeleton of a poster. */
export function PosterSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("aspect-[2/3] w-full", className)} />;
}

/** A skeleton of a text line. */
export function LineSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-3 w-full", className)} />;
}
