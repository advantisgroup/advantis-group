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

const SESSION_KEY = "analytics_sid";

export const CONVEX_SITE_URL =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
  process.env.NEXT_PUBLIC_CONVEX_URL?.replace(".convex.cloud", ".convex.site");

export function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // Storage blocked (locked-down private mode) — a fresh id every
    // pageview just makes duration/bounce math a little less precise, not broken.
    return crypto.randomUUID();
  }
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
 * `name` once per browser session under `key` (defaults to the name) — for
 * "opened" events that would otherwise count every re-render or revisit.
 * Also safe when the same component mounts twice (desktop + mobile header).
 */
export function useTrackOnce(name: string, key: string | null = name) {
  const trackEvent = useTrackEvent();
  useEffect(() => {
    if (!key) return;
    const flag = `analytics_once:${key}`;
    try {
      if (sessionStorage.getItem(flag)) return;
      sessionStorage.setItem(flag, "1");
    } catch {
      // storage blocked: better to count it than to never count it
    }
    trackEvent(name);
  }, [name, key, trackEvent]);
}
