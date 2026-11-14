import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type Tone = "neutral" | "accent" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-muted text-text-muted border-border",
  accent: "bg-accent/10 text-accent border-accent/30",
  danger: "bg-danger/10 text-danger border-danger/30",
};

/** A small, flat label. */
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-control border px-1.5 py-0.5 text-[11px] leading-4",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
