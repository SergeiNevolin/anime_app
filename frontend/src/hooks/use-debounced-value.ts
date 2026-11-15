"use client";

import { useEffect, useState } from "react";

/**
 * Return the value after it stopped changing for `delay` milliseconds.
 *
 * It keeps the request rate low while the user types in the search field.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
