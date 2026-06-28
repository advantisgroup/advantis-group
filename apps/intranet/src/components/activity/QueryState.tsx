"use client";

import type { ReactNode } from "react";

/**
 * Standardizes the states of a Convex `useQuery` result so loading, empty and
 * ready never get rendered inconsistently (or, worse, an error masquerading as
 * an endless spinner):
 *
 *   - `undefined`        → still loading. Render `loading`.
 *   - empty (see below)  → render the calm, localized `empty` state.
 *   - otherwise          → render `children(data)`.
 *
 * Note: a genuine Convex query *error* throws to the nearest <ErrorBoundary>
 * (the dashboard wraps every page in one), so `undefined` here is unambiguously
 * "loading" — not a swallowed failure.
 *
 * By default an array result is "empty" when it has length 0; override with
 * `isEmpty` for other shapes.
 */
export function QueryState<T>({
  data,
  loading,
  empty,
  isEmpty,
  children,
}: {
  data: T | undefined;
  loading: ReactNode;
  empty: ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  if (data === undefined) return <>{loading}</>;
  const blank = isEmpty
    ? isEmpty(data)
    : Array.isArray(data) && data.length === 0;
  if (blank) return <>{empty}</>;
  return <>{children(data)}</>;
}
