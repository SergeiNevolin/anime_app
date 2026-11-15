"use client";

import { useId, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils/cn";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when the user presses Enter. */
  onSubmit?: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

/**
 * A controlled search field.
 *
 * The component reports every keystroke immediately; the debouncing of the
 * *request* is done by the caller with `useDebouncedValue`, so there is a
 * single place that decides how often the backend is queried.
 */
export function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Поиск аниме",
  autoFocus = false,
  className,
}: SearchInputProps) {
  const id = useId();

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && onSubmit) {
      event.preventDefault();
      onSubmit(value);
    }
  };

  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        type="search"
        inputMode="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        className="h-10 w-full rounded-control border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
      />
    </div>
  );
}
