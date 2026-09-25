"use client";

import { useCallback, useEffect } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { useLocale } from "next-intl";

/**
 * Shared client-side pieces of the first-party analytics setup (see
 * `AnalyticsTracker.tsx` for the pageview/duration half). `getSessionId`
 * lives here too so the conversion-event call sites (whitepaper, contact
 * forms) mint the same kind of session-scoped, non-persistent id the
 * pageview tracker uses — one session, one id, no cookies either way.
 */

export const CONVEX_SITE_URL =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
  process.env.NEXT_PUBLIC_CONVEX_URL?.replace(".convex.cloud", ".convex.site");

// Held in memory only. Anything written to the visitor's device (sessionStorage
// included) that isn't strictly needed would need consent under § 25 TDDDG;
// a module variable doesn't touch the device at all. It lives as long as the
// page does: across client-side navigation, not across a reload.
let sessionId: string | null = null;

export function getSessionId(): string {
  sessionId ??= crypto.randomUUID();
  return sessionId;
}

// what `useTrackOnce` already counted in this page's lifetime, for the same reason
const trackedOnce = new Set<string>();

/** true the first time `key` is seen in this page's lifetime. */
export function firstTime(key: string): boolean {
  if (trackedOnce.has(key)) return false;
  trackedOnce.add(key);
  return true;
}

/**
 * Named conversion events — the direct replacement for `posthog.capture(…)`.
 *
 * Fire-and-forget with errors swallowed, matching what PostHog did: the
 * whitepaper request and the contact forms are the actual job, and an
 * analytics write failing (offline, Convex hiccup) must never fail or delay
 * the thing it's only there to measure.
 */
export function useTrackEvent() {
  const recordEvent = useMutation(api.marketing.analytics.recordEvent);
  const locale = useLocale();

  return useCallback(
    (name: string) => {
      void recordEvent({ name, sessionId: getSessionId(), locale }).catch(() => {});
    },
    [recordEvent, locale],
  );
}

/**
 * `name` once per page lifetime under `key` (defaults to the name) — for
 * "opened" events that would otherwise count every re-render or revisit.
 * Also safe when the same component mounts twice (desktop + mobile header).
 */
export function useTrackOnce(name: string, key: string | null = name) {
  const trackEvent = useTrackEvent();
  useEffect(() => {
    if (key && firstTime(key)) trackEvent(name);
  }, [name, key, trackEvent]);
}
