"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils/cn";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  /** Delay in milliseconds before the change is reported. */
  debounceMs?: number;
}

/**
 * A search field with a debounce.
 *
 * The debounce keeps the request rate low while the user types.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Поиск аниме",
  autoFocus = false,
  className,
  debounceMs = 350,
}: SearchInputProps) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  const handleChange = (next: string) => {
    setLocal(next);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => onChange(next), debounceMs);
  };

  return (
    <div className={cn("relative", className)}>
      <input
        type="search"
        inputMode="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label={placeholder}
        placeholder={placeholder}
        value={local}
        autoFocus={autoFocus}
        onChange={(event) => handleChange(event.target.value)}
        className="h-10 w-full rounded-control border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
      />
    </div>
  );
}
