"use client";

import { useSyncExternalStore } from "react";

import { Check, CloudOff, History } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { DraftMenu } from "./DraftMenu";
import { type Draft } from "./use-draft";
import { useRelativeTime } from "./use-relative-time";

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
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
  const online = useOnline();
  if (draft.status === "idle" && !draft.savedAt) {
    return (
      <span className={cn("inline-flex items-center", className)}>
        <DraftMenu draft={draft} />
      </span>
    );
  }

  const waiting = draft.status !== "saved" && draft.status !== "idle";

  return (
    <span
      aria-live="polite"
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground",
        className,
      )}
    >
      {!online && waiting ? (
        <>
          <CloudOff className="size-3 shrink-0 text-warning" />
          <span className="truncate">{t("draftOffline")}</span>
        </>
      ) : draft.status === "error" ? (
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
      <DraftMenu draft={draft} />
    </span>
  );
}

/** Shown once, above a form that was filled back in from a draft. */
export function DraftRestoredNote({
  draft,
  onStartOver,
  filesNotKept,
  className,
}: {
  draft: Draft;
  onStartOver?: () => void;
  /** The form takes attachments, which a draft can't hold — say so. */
  filesNotKept?: boolean;
  className?: string;
}) {
  const t = useTranslations("Compose");
  const ago = useRelativeTime(draft.restoredAt);
  if (!draft.restoredAt) return null;
  return (
    <div
      className={cn(
        "ai-rise rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-2">
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
      {filesNotKept && <p className="mt-1 pl-[1.375rem]">{t("draftFilesNotKept")}</p>}
    </div>
  );
}

/** The question for a form with a stored draft behind it — an older one for
 *  something already saved, or a newer one from another tab. */
export function DraftOfferBanner({ draft, className }: { draft: Draft; className?: string }) {
  const t = useTranslations("Compose");
  const ago = useRelativeTime(draft.offer?.savedAt ?? null);
  if (!draft.offer) return null;
  const remote = draft.offer.remote;
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
        <p className="text-sm font-semibold">{remote ? t("offerRemoteTitle") : t("offerTitle")}</p>
        <p className="text-xs text-muted-foreground">
          {remote ? t("offerRemoteBody", { time: ago ?? "" }) : t("offerBody", { time: ago ?? "" })}
        </p>
      </div>
      <div className="flex gap-1.5">
        <Button size="xs" variant="ghost" onClick={draft.declineOffer}>
          {remote ? t("offerRemoteKeep") : t("offerDecline")}
        </Button>
        <Button size="xs" onClick={draft.acceptOffer}>
          {remote ? t("offerRemoteLoad") : t("offerRestore")}
        </Button>
      </div>
    </div>
  );
}
