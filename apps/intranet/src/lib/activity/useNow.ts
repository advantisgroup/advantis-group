"use client";

import { useEffect, useState } from "react";

import { nowMs } from "./fmt";

/**
 * The current time, re-read every `intervalMs` (default 30 s), so relative
 * labels ("last seen 4 min ago", "since 09:12 · 23 min") stay fresh while the
 * underlying data is unchanged. Convex only pushes a re-render when data
 * changes; without a tick the wall-clock labels freeze at their render time.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(nowMs);

  useEffect(() => {
    const id = window.setInterval(() => setNow(nowMs()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
