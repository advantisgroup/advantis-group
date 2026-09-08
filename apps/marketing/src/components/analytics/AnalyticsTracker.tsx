"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { useLocale } from "next-intl";

import { CONVEX_SITE_URL, getSessionId } from "@/lib/analytics";

/**
 * First-party pageview + duration tracking, replacing PostHog. Mounted once
 * in the root `[locale]` layout — Next's App Router keeps that layout
 * mounted across client-side navigations, so `pathname` changing is exactly
 * "a new pageview happened," and the referrer captured on first mount stays
 * correct for the whole tab session (`document.referrer` doesn't update on
 * `pushState`).
 *
 * `sessionId` lives in `sessionStorage` — gone the moment the tab closes.
 * That's the whole reason this needs no cookie banner: there's nothing
 * persistent to consent to.
 */

export function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const recordPageview = useMutation(api.marketingAnalytics.recordPageview);

  // Only the landing hit of a share link is attributed. Carrying `?r=` into
  // every later pageview would credit the sharer for the whole visit, which
  // isn't what "they brought this person here" means.
  const ref = searchParams.get("r") ?? undefined;

  const referrerDomainRef = useRef<string | undefined>(undefined);
  const referrerCapturedRef = useRef(false);
  const currentRef = useRef<{ id: Id<"analyticsPageviews">; start: number } | null>(null);

  useEffect(() => {
    if (referrerCapturedRef.current) return;
    referrerCapturedRef.current = true;
    if (!document.referrer) return;
    try {
      const referrer = new URL(document.referrer);
      if (referrer.hostname !== window.location.hostname) {
        referrerDomainRef.current = referrer.hostname;
      }
    } catch {
      // Malformed referrer header — leave unset, counts as direct.
    }
  }, []);

  const flushDuration = () => {
    const current = currentRef.current;
    if (!current || !CONVEX_SITE_URL) return;
    currentRef.current = null;
    const durationMs = Date.now() - current.start;
    const body = JSON.stringify({ pageviewId: current.id, durationMs });
    navigator.sendBeacon?.(
      `${CONVEX_SITE_URL}/analytics/duration`,
      new Blob([body], { type: "application/json" }),
    );
  };

  useEffect(() => {
    let cancelled = false;
    flushDuration();

    void recordPageview({
      path: pathname,
      locale,
      sessionId: getSessionId(),
      referrerDomain: referrerDomainRef.current,
      ref,
    }).then((id) => {
      if (!cancelled && id) currentRef.current = { id, start: Date.now() };
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recordPageview is a fresh function identity every render
  }, [pathname, locale, ref]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushDuration();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flushDuration);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flushDuration);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flushDuration closes over refs, not state
  }, []);

  return null;
}
