"use client";

import { Check, CloudOff, History } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";

import { type Draft } from "./use-draft";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
  ["second", 1_000],
];

/** "12 seconds ago" / "vor 12 Sekunden", kept fresh while on screen. */
export function useRelativeTime(ms: number | null): string | null {
  const t = useTranslations("Compose");
  const locale = useLocale();
  const now = useNow(ms !== null, 15_000);
  if (ms === null) return null;
  const diff = Math.max(0, now - ms);
  if (diff < 10_000) return t("justNow");
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (diff >= size) return format.format(-Math.floor(diff / size), unit);
  }
  return t("justNow");
}

/** The composer-header line that answers "is my work safe?". */
export function DraftIndicator({
  draft,
  onDiscard,
  className,
}: {
  draft: Draft;
  onDiscard?: () => void;
  className?: string;
}) {
  const t = useTranslations("Compose");
  const ago = useRelativeTime(draft.savedAt);
  if (draft.status === "idle" && !draft.savedAt) return null;

  return (
    <span
      aria-live="polite"
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground",
        className,
      )}
    >
      {draft.status === "error" ? (
        <>
          <CloudOff className="size-3 shrink-0 text-warning" />
          <span className="truncate">{t("draftError")}</span>
        </>
      ) : draft.status === "pending" || draft.status === "saving" ? (
        <>
          <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-muted-foreground/70" />
          <span className="truncate">{t("draftSaving")}</span>
        </>
      ) : (
        <>
          <Check className="size-3 shrink-0 text-success" strokeWidth={3} />
          <span className="truncate">{t("draftSaved", { time: ago ?? "" })}</span>
        </>
      )}
      {onDiscard && draft.savedAt && (
        <button
          type="button"
          onClick={onDiscard}
          className="shrink-0 underline-offset-2 hover:text-foreground hover:underline"
        >
          {t("draftDiscard")}
        </button>
      )}
    </span>
  );
}

/** Shown once, above a form that was filled back in from a draft. */
export function DraftRestoredNote({
  draft,
  onStartOver,
  className,
}: {
  draft: Draft;
  onStartOver?: () => void;
  className?: string;
}) {
  const t = useTranslations("Compose");
  const ago = useRelativeTime(draft.restoredAt);
  if (!draft.restoredAt) return null;
  return (
    <div
      className={cn(
        "ai-rise flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <History className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-foreground">{t("draftRestored")}</span> · {ago}
      </span>
      {onStartOver && (
        <button
          type="button"
          onClick={onStartOver}
          className="shrink-0 font-medium underline-offset-2 hover:text-foreground hover:underline"
        >
          {t("startOver")}
        </button>
      )}
    </div>
  );
}

/** The question for an edit form with an older unsaved draft behind it. */
export function DraftOfferBanner({ draft, className }: { draft: Draft; className?: string }) {
  const t = useTranslations("Compose");
  const ago = useRelativeTime(draft.offer?.savedAt ?? null);
  if (!draft.offer) return null;
  return (
    <div
      role="alert"
      className={cn(
        "ai-rise flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2.5",
        className,
      )}
    >
      <History className="size-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t("offerTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("offerBody", { time: ago ?? "" })}</p>
      </div>
      <div className="flex gap-1.5">
        <Button size="xs" variant="ghost" onClick={draft.declineOffer}>
          {t("offerDecline")}
        </Button>
        <Button size="xs" onClick={draft.acceptOffer}>
          {t("offerRestore")}
        </Button>
      </div>
    </div>
  );
}
