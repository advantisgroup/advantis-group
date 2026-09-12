"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * A page that is one full-height workspace rather than a scrolling document —
 * the ticket chat, say — asks the shell for the whole height of `<main>`.
 *
 * Registered as state instead of added to the shell's pathname-based
 * `immersive` list for two reasons. The ticket workspace shares `/it-tickets`
 * with the ticket list and differs only by `?ticket=`, so a pathname can't tell
 * them apart. And `immersive` swaps the shell's element tree, which remounts the
 * page — opening a ticket would throw away the list's filters and search. This
 * only changes classes, so nothing underneath remounts.
 */
let count = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

export function useFillPage(active: boolean) {
  useEffect(() => {
    if (!active) return;
    count += 1;
    notify();
    return () => {
      count -= 1;
      notify();
    };
  }, [active]);
}

export function useFillPagePresent(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => count > 0,
    () => false,
  );
}
