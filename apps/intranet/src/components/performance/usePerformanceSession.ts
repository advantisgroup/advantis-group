"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";

import { getPerformanceToken } from "@/lib/performanceAuth";

/** Resolves the caller's effective Performance session — the password
 * cookie if one exists, or (see `performanceAuth.ts`'s
 * `resolveActiveSession`) a fallback to the caller's linked intranet
 * (Clerk) account when it doesn't. `token` is always a string, never
 * `null` — pass it straight through to any Performance query/mutation
 * without a `token ? {...} : "skip"` guard: an empty string still resolves
 * server-side via the Clerk fallback, so skipping the query for a
 * Clerk-linked visitor (who never has a cookie) would leave the page
 * loading forever. */
export function usePerformanceSession() {
  const [token] = useState<string>(() => getPerformanceToken() ?? "");
  const session = useQuery(api.performanceAuth.validateSession, { token });
  return { token, session };
}
