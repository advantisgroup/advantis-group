"use client";

import { useEffect, useState } from "react";

function localMidnight(): number {
  return new Date().setHours(0, 0, 0, 0);
}

/**
 * Local midnight of the current day, as a timestamp that only changes when the
 * day does. Stable within a day, so it can sit in Convex query args without
 * resubscribing every render — and it rolls over for the tab that stays open
 * overnight (a timer for midnight, plus a re-check when the tab comes back,
 * since a sleeping laptop doesn't fire timers on time).
 */
export function useStartOfToday(): number {
  const [start, setStart] = useState(localMidnight);

  useEffect(() => {
    const refresh = () => setStart(localMidnight());
    const nextMidnight = new Date(start);
    nextMidnight.setDate(nextMidnight.getDate() + 1);
    const timer = window.setTimeout(refresh, nextMidnight.getTime() - Date.now() + 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [start]);

  return start;
}

/** `start` moved by whole local days, DST-safe. */
export function addLocalDays(start: number, days: number): number {
  const d = new Date(start);
  d.setDate(d.getDate() + days);
  return d.getTime();
}
