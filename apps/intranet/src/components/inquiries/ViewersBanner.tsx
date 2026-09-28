"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { VIEWER_HEARTBEAT_MS, VIEWER_STALE_MS } from "@advantis/convex/marketing/inquiry";
import { useMutation, useQuery } from "convex/react";
import { Eye, PenLine } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

/**
 * Tells the others this inquiry is open here (and whether a reply is being
 * written), for as long as the page is visible. Returns who else is on it.
 */
export function useInquiryViewers(id: Id<"emails"> | undefined, typing: boolean) {
  const heartbeat = useMutation(api.marketing.inbox.heartbeat);
  const leave = useMutation(api.marketing.inbox.leave);
  const rows = useQuery(api.marketing.inbox.viewers, id ? { id } : "skip");
  const [now, setNow] = useState(() => Date.now());

  const typingRef = useRef(typing);
  typingRef.current = typing;

  // on the page: beat every few seconds while visible, leave when hidden or gone
  useEffect(() => {
    if (!id) return;
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      void heartbeat({ id, typing: typingRef.current }).catch(() => {});
    };
    beat();
    const timer = setInterval(beat, VIEWER_HEARTBEAT_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") beat();
      else void leave({ id }).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      void leave({ id }).catch(() => {});
    };
  }, [id, heartbeat, leave]);

  // starting or stopping a reply shows up straight away, not at the next beat
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (id) void heartbeat({ id, typing }).catch(() => {});
  }, [id, typing, heartbeat]);

  // the query doesn't re-run as time passes, so staleness is judged on this clock
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  return (rows ?? []).filter((row) => row.at > now - VIEWER_STALE_MS);
}

/** "Anna is writing a reply" — above the reply box, where it matters. */
export function ViewersBanner({ viewers }: { viewers: ReturnType<typeof useInquiryViewers> }) {
  const t = useTranslations("Inquiries.viewers");
  const locale = useLocale();
  if (viewers.length === 0) return null;

  const writing = viewers.filter((viewer) => viewer.typing).map((viewer) => viewer.name);
  const reading = viewers.filter((viewer) => !viewer.typing).map((viewer) => viewer.name);
  const list = (names: string[]) =>
    new Intl.ListFormat(locale, { type: "conjunction" }).format(names);

  return (
    <div
      role="status"
      className={
        writing.length
          ? "mt-4 flex flex-col gap-1 rounded-md border border-warn/50 bg-warn/5 px-3 py-2 text-sm"
          : "mt-4 flex flex-col gap-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
      }
    >
      {writing.length ? (
        <p className="flex items-center gap-2">
          <PenLine aria-hidden className="size-4 shrink-0 text-warn" />
          {t("writing", { names: list(writing), count: writing.length })}
        </p>
      ) : null}
      {reading.length ? (
        <p className="flex items-center gap-2">
          <Eye aria-hidden className="size-4 shrink-0" />
          {t("viewing", { names: list(reading), count: reading.length })}
        </p>
      ) : null}
    </div>
  );
}
