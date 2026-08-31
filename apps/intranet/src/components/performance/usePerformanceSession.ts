"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";

import { getPerformanceToken, setPerformanceToken } from "@/lib/performanceAuth";

/** Resolves the caller's effective Performance session — the password
 * cookie if one exists, or (see `performanceAuth.ts`'s
 * `resolveActiveSession`) a fallback to the caller's linked intranet
 * (Clerk) account when it doesn't. `token` is always a string, never
 * `null` — pass it straight through to any Performance query/mutation
 * without a `token ? {...} : "skip"` guard: an empty string still resolves
 * server-side via the Clerk fallback, so skipping the query for a
 * Clerk-linked visitor (who never has a cookie) would leave the page
 * loading forever.
 *
 * A Clerk-linked session also gets silently promoted into a real password
 * session token (stored the same way a password login is) the moment it
 * resolves — some Performance actions (report uploads) go through apps/api,
 * which authenticates a bearer token directly and can't see the caller's
 * Clerk identity, so without a real token those actions would be
 * permanently unreachable for a Clerk-linked visitor. */
export function usePerformanceSession() {
  const [token, setToken] = useState<string>(() => getPerformanceToken() ?? "");
  const session = useQuery(api.performanceAuth.validateSession, { token });
  const promote = useMutation(api.performanceAuth.createSessionForLinkedAccount);
  const promoting = useRef(false);

  useEffect(() => {
    if (!session?.valid || !session.viaClerk || promoting.current) return;
    promoting.current = true;
    void promote({})
      .then((result) => {
        if (!result) return;
        setPerformanceToken(result.token, result.expiresAt);
        setToken(result.token);
      })
      .finally(() => {
        promoting.current = false;
      });
  }, [session, promote]);

  return { token, session };
}
