"use client";

import { useEffect, useState } from "react";

/** `value`, once it has stopped changing for `delayMs` — for searches that
 *  shouldn't run a server query on every keystroke. */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
