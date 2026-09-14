"use client";

import { Fragment, type ReactNode, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import type { Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { FilePlus2, FileStack, History } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useConfirm } from "@/components/ui/dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { draftPreview } from "@/lib/draft-preview";
import { diffWords } from "@/lib/text-diff";

import { useRelativeTime } from "./DraftIndicator";
import { type Draft } from "./use-draft";

function Ago({ ms }: { ms: number }) {
  return <>{useRelativeTime(ms)}</>;
}

/** What restoring `versionData` would change compared to what's in the form
 *  right now — red/struck-through for text that would go away, green for
 *  text that would come back. Plain "nothing to show" when they match. */
function VersionDiff({ currentData, versionData }: { currentData: string; versionData: string }) {
  const t = useTranslations("Compose");
  const tokens = useMemo(() => {
    const current = draftPreview(currentData);
    const version = draftPreview(versionData);
    return diffWords(
      [current.title, current.snippet].filter(Boolean).join(" — "),
      [version.title, version.snippet].filter(Boolean).join(" — "),
    );
  }, [currentData, versionData]);

  if (tokens.every((token) => token.type === "same")) {
    return <p className="text-sm text-muted-foreground">{t("draftsRestoreNoChange")}</p>;
  }

  return (
    <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
      {tokens.map((token, i) => (
        <Fragment key={i}>
          {token.type === "removed" ? (
            <span className="rounded-[3px] bg-destructive/10 text-destructive line-through">
              {token.text}
            </span>
          ) : token.type === "added" ? (
            <span className="rounded-[3px] bg-success/10 text-success">{token.text}</span>
          ) : (
            token.text
          )}
        </Fragment>
      ))}
    </p>
  );
}

function MenuRow({
  title,
  meta,
  onClick,
  disabled,
}: {
  title: string;
  meta: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent/60 disabled:opacity-50"
    >
      <span className="block truncate text-[13px] font-medium">{title}</span>
      <span className="block truncate text-xs text-muted-foreground">{meta}</span>
    </button>
  );
}

function MenuBody({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const t = useTranslations("Compose");
  const router = useRouter();
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const others = useQuery(api.drafts.listOthers, {
    surface: draft.surface,
    subjectKey: draft.subjectKey,
  });
  const versions = useQuery(api.drafts.listVersions, {
    surface: draft.surface,
    subjectKey: draft.subjectKey,
  });
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true);
    try {
      await action();
      toast.success(message);
      onDone();
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  /** Undoing a restore is just restoring the snapshot the restore itself took
   *  right before overwriting anything — so it's offered the same way. Only
   *  missing when there was nothing to undo back to (nothing unsaved yet). */
  function offerUndo(previousVersionId: Id<"draftVersions"> | null) {
    toast.success(t("draftsVersionRestored"), {
      duration: previousVersionId ? 10_000 : undefined,
      action: previousVersionId
        ? {
            label: t("draftsUndo"),
            onClick: () => {
              void draft
                .restoreVersion(previousVersionId)
                .then(() => toast.success(t("draftsUndoDone")))
                .catch(handleError);
            },
          }
        : undefined,
    });
  }

  async function restoreVersion(versionId: Id<"draftVersions">, savedAt: number, data: string) {
    const ok = await confirm({
      title: t("draftsRestoreTitle"),
      description: t("draftsRestoreBody"),
      destructive: false,
      details: [{ label: t("draftsRestoreFrom"), value: <Ago ms={savedAt} /> }],
      tip: <VersionDiff currentData={draft.currentData} versionData={data} />,
      confirmLabel: t("draftsRestoreConfirm"),
      cancelLabel: t("draftsRestoreCancel"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { previousVersionId } = await draft.restoreVersion(versionId);
      onDone();
      offerUndo(previousVersionId);
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={busy || !draft.savedAt}
        onClick={() => void run(draft.startNew, t("draftsStartedNew"))}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors hover:bg-accent/60 disabled:opacity-50"
      >
        <FilePlus2 className="size-4 text-muted-foreground" />
        {t("draftsStartNew")}
      </button>

      <section>
        <h3 className="flex items-center gap-1.5 px-2.5 pb-1 text-xs font-medium text-muted-foreground">
          <FileStack className="size-3.5" />
          {t("draftsOthers")}
        </h3>
        {others === undefined ? null : others.length === 0 ? (
          <p className="px-2.5 py-1.5 text-xs text-muted-foreground">{t("draftsNoOthers")}</p>
        ) : (
          <div className="max-h-48 overflow-y-auto">
            {others.map((other) => {
              const { title, snippet } = draftPreview(other.data);
              return (
                <MenuRow
                  key={other._id}
                  disabled={busy}
                  title={title || snippet || t("draftsUntitled")}
                  meta={<Ago ms={other.updatedAt} />}
                  onClick={() => {
                    if (other.parked) {
                      void run(() => draft.resume(other._id), t("draftsSwitched"));
                    } else if (other.href) {
                      onDone();
                      router.push(other.href);
                    }
                  }}
                />
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h3 className="flex items-center gap-1.5 px-2.5 pb-1 text-xs font-medium text-muted-foreground">
          <History className="size-3.5" />
          {t("draftsVersions")}
        </h3>
        {versions === undefined ? null : versions.length === 0 ? (
          <p className="px-2.5 py-1.5 text-xs text-muted-foreground">{t("draftsNoVersions")}</p>
        ) : (
          <div className="max-h-48 overflow-y-auto">
            {versions.map((version, i) => {
              const { title, snippet } = draftPreview(version.data);
              const number = versions.length - i;
              return (
                <MenuRow
                  key={version._id}
                  disabled={busy}
                  title={t("draftsVersionNumber", { number })}
                  meta={
                    <>
                      <Ago ms={version.savedAt} /> · {title || snippet || t("draftsUntitled")}
                    </>
                  }
                  onClick={() => void restoreVersion(version._id, version.savedAt, version.data)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/** Every composer's way into its other drafts and earlier versions. */
export function DraftMenu({ draft }: { draft: Draft }) {
  const t = useTranslations("Compose");
  const [open, setOpen] = useState(false);
  if (!draft.hydrated) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("draftsMenu")}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <FileStack className="size-3" />
          {t("draftsMenu")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5">
        <MenuBody draft={draft} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
