"use client";

import { useMemo } from "react";

import { treaty } from "@elysiajs/eden";
import { useAuth } from "@clerk/nextjs";

import type { App } from "@advantis/api";

const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "http://localhost:3002";

/** Typed client for the Advantis API (api.advantisgroup.de) — unauthenticated. */
export const api = treaty<App>(baseUrl);

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
        headers: async () => {
          const token = await getToken();
          return token ? { authorization: `Bearer ${token}` } : {};
        },
      }),
    [getToken],
  );
}
