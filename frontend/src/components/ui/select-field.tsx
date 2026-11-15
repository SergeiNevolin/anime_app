"use client";

import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * A labelled select with a consistent chevron.
 *
 * The three selectors of the playback panel (series, dubbing, quality) used to
 * repeat the same markup and the same inline background image; the shared
 * class `select-control` in `globals.css` replaces that duplication.
 */
export function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
  className,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const id = useId();

  return (
    <div className={cn("w-full", className)}>
      {label ? (
        <label
          htmlFor={id}
          className="mb-1 block text-[12px] font-medium text-text-muted"
        >
          {label}
        </label>
      ) : null}
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="select-control w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none disabled:opacity-50"
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The small poster of a list item.
 */
export function PosterThumbnail({
  src,
  alt,
  width,
  height,
  className,
}: {
  src?: string | null;
  alt: string;
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-control bg-surface-muted",
        className,
      )}
      style={{ width, height }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : null}
    </div>
  );
}

/**
 * Wrap the content of a section into a titled block.
 */
export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-border pb-1.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-muted">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
