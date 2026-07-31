"use client";

import { useMemo } from "react";

import { treaty } from "@elysiajs/eden";
import { useAuth } from "@clerk/nextjs";

import type { App } from "@advantis/api";

const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "http://localhost:3002";

/**
 * Eden's JSON reviver auto-detects date-like strings (including plain
 * YYYY-MM-DD, not just full ISO timestamps) and converts them to `Date`
 * instances — silently turning every `startDate`/`endDate` string apps/api
 * sends into an object, which broke both `formatIsoDate` (typeof guard
 * returns "") and `workingDays` (`${date}` on a Date stringifies to
 * something `new Date()` can't reparse, so it hit the NaN early-return).
 * `parseDate: false` keeps API responses as the plain strings/types this
 * app's route handlers actually declare.
 */
const edenOptions = { parseDate: false } as const;

/** Typed client for the Advantis API (api.advantisgroup.de) — unauthenticated. */
export const api = treaty<App>(baseUrl, edenOptions);

/**
 * Typed client with the Clerk session token attached as a Bearer header on
 * every request. Cross-origin requests (this app is a different origin than
 * api.advantisgroup.de) can't rely on the Clerk cookie, same reasoning as
 * `applicants-api.ts`'s `useApplicantsApi` — this centralizes that so new
 * apps/api-backed features don't each re-derive it.
 */
export function useEdenApi() {
  const { getToken } = useAuth();
  return useMemo(
    () =>
      treaty<App>(baseUrl, {
        ...edenOptions,
        headers: async () => {
          const token = await getToken();
          return token ? { authorization: `Bearer ${token}` } : {};
        },
      }),
    [getToken],
  );
}
