"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Copy, Pencil, RotateCcw, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AiButton } from "@/components/ai/AiButton";
import { AiRunCard } from "@/components/ai/AiRunCard";
import { type AiRunView, useAiRun } from "@/components/ai/use-ai-run";
import { Button } from "@/components/ui/button";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { htmlToText, RichText } from "@/components/ui/rich-text";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { diffWikiFormat, type FormatHunk } from "@/lib/wiki-format-diff";
import { useWikiFormatApi } from "@/lib/wiki-format-api";

const LAST_INSTRUCTIONS_KEY = "wiki:formatInstructions";

export function useWikiFormatRun(entryKey: string): AiRunView<string> {
  return useAiRun({ subjectKey: `wikiFormat:${entryKey}` });
}

/** Anything the manager hasn't looked at yet gets the composer's AI pane. */
export function formatRunNeedsPane(view: AiRunView<string>): boolean {
  return !!view.run && !view.run.seenAt;
}

function useStartFormat(entryKey: string, href: string | undefined) {
  const formatApi = useWikiFormatApi();
  const handleError = useErrorHandler();
  return async (html: string, instructions: string): Promise<boolean> => {
    try {
      localStorage.setItem(LAST_INSTRUCTIONS_KEY, instructions);
    } catch {
      // Storage unavailable — a retry falls back to the saved default.
    }
    try {
      await formatApi.start({ html, instructions, subjectKey: entryKey, href });
      return true;
    } catch (e) {
      handleError(e);
      return false;
    }
  };
}

/**
 * The small part of formatting with AI: say how, then go. Lives in the
 * editor toolbar. The result never comes back here — it opens in the
 * composer's AI pane, where there's room to actually review it.
 */
export function WikiFormatTrigger({
  html,
  entryKey,
  href,
  inline = false,
  onShowReview,
}: {
  html: string;
  entryKey: string;
  href?: string;
  inline?: boolean;
  onShowReview: () => void;
}) {
  const t = useTranslations("Guidebooks");
  const isMobile = useIsMobile();
  const handleError = useErrorHandler();
  const view = useWikiFormatRun(entryKey);
  const savedDefault = useQuery(api.wikiFormatSettings.get) ?? "";
  const saveDefault = useMutation(api.wikiFormatSettings.set);
  const start = useStartFormat(entryKey, href);

  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [starting, setStarting] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);

  function onOpenChange(next: boolean) {
    // While a run is out or waiting for review, the button leads to it —
    // a second one would only be refused.
    if (next && formatRunNeedsPane(view)) {
      onShowReview();
      return;
    }
    setOpen(next);
    if (next) setInstructions(savedDefault);
  }

  async function run() {
    const trimmed = instructions.trim();
    if (!trimmed) {
      toast.error(t("formatAssistNeedsInstructions"));
      return;
    }
    setStarting(true);
    const ok = await start(html, trimmed);
    setStarting(false);
    if (ok) {
      setOpen(false);
      onShowReview();
    }
  }

  async function onSaveDefault() {
    setSavingDefault(true);
    try {
      await saveDefault({ value: instructions.trim() });
      toast.success(t("formatAssistDefaultSaved"));
    } catch (e) {
      handleError(e);
    } finally {
      setSavingDefault(false);
    }
  }

  const body = (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            {t("formatAssistInstructions")}
          </label>
          <button
            type="button"
            title={t("formatAssistSaveDefault")}
            aria-label={t("formatAssistSaveDefault")}
            disabled={savingDefault || !instructions.trim()}
            onClick={() => void onSaveDefault()}
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <Save className="size-3.5" />
          </button>
        </div>
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={t("formatAssistInstructionsPlaceholder")}
          rows={4}
          className="text-sm"
        />
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          {t("formatAssistHint")}
        </p>
      </div>
      <div className="flex justify-end">
        <AiButton
          working={starting}
          disabled={starting || !htmlToText(html).trim()}
          onClick={() => void run()}
        >
          {t("formatAssistCta")}
        </AiButton>
      </div>
    </div>
  );

  const trigger = (
    <AiButton
      look={inline ? "icon" : "floating"}
      working={view.state === "working"}
      title={t("formatAssistCta")}
      aria-label={t("formatAssistCta")}
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={isMobile ? () => onOpenChange(true) : undefined}
      className={cn(!inline && "absolute bottom-3 right-3 z-10")}
    />
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <MobileDrawer open={open} onOpenChange={setOpen} ariaLabel={t("formatAssistCta")}>
          <div className="border-b border-border/70 px-5 pb-3">
            <p className="font-display text-lg font-semibold leading-tight tracking-tight">
              {t("formatAssistCta")}
            </p>
          </div>
          <div className="overflow-y-auto px-5 py-4">{body}</div>
        </MobileDrawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        {body}
      </PopoverContent>
    </Popover>
  );
}

/** One reviewable block. Unchanged blocks render quietly; changed ones carry
 * the Aurora bar and three icon actions — copy, revert just this block, or
 * edit it — so nothing lands without having been looked at. */
function Hunk({
  hunk,
  accepted,
  index,
  onRevertToggle,
  onEdit,
}: {
  hunk: FormatHunk;
  accepted: string;
  index: number;
  onRevertToggle: () => void;
  onEdit: (html: string) => void;
}) {
  const t = useTranslations("Guidebooks");
  const [editing, setEditing] = useState(false);
  const reverted = accepted === hunk.original;

  if (hunk.kind === "unchanged") {
    return (
      <div className="ai-rise px-4" style={{ ["--i" as string]: index }}>
        <RichText html={hunk.original} className="text-sm text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "ai-rise relative rounded-xl border py-2.5 pl-4 pr-2.5",
        reverted ? "border-border/60 bg-muted/20" : "border-border/70 bg-card",
      )}
      style={{ ["--i" as string]: index }}
    >
      <span
        aria-hidden
        className="absolute inset-y-2.5 left-1.5 w-0.5 rounded-full"
        style={{
          background: reverted ? "var(--border)" : "linear-gradient(var(--ai-1), var(--ai-3))",
        }}
      />
      {editing ? (
        <div
          contentEditable
          suppressContentEditableWarning
          autoFocus
          dangerouslySetInnerHTML={{ __html: accepted }}
          onBlur={(e) => {
            onEdit(e.currentTarget.innerHTML);
            setEditing(false);
          }}
          className="rounded border border-input bg-background px-2 py-1.5 text-sm outline-none"
        />
      ) : (
        <RichText html={accepted} className="text-sm" />
      )}
      <div className="mt-1.5 flex items-center justify-end gap-0.5">
        <button
          type="button"
          title={t("formatAssistCopy")}
          aria-label={t("formatAssistCopy")}
          onClick={() => {
            navigator.clipboard.writeText(htmlToText(accepted)).catch(() => {});
          }}
          className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Copy className="size-3.5" />
        </button>
        <button
          type="button"
          title={t("formatAssistRevert")}
          aria-label={t("formatAssistRevert")}
          aria-pressed={reverted}
          onClick={onRevertToggle}
          className={cn(
            "flex size-6 items-center justify-center rounded transition-colors hover:bg-accent",
            reverted ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <RotateCcw className="size-3.5" />
        </button>
        <button
          type="button"
          title={t("formatAssistEdit")}
          aria-label={t("formatAssistEdit")}
          onClick={() => setEditing(true)}
          className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * The AI pane of the wiki composer: the run while it works, then every
 * changed block side by side with the rest of the entry, full height.
 * The diff is taken against the text as it was when the result arrived, so
 * later typing can't reshuffle the blocks under the reviewer's cursor.
 */
export function WikiFormatReview({
  html,
  entryKey,
  href,
  onApply,
}: {
  html: string;
  entryKey: string;
  href?: string;
  onApply: (html: string) => void;
}) {
  const t = useTranslations("Guidebooks");
  const view = useWikiFormatRun(entryKey);
  const savedDefault = useQuery(api.wikiFormatSettings.get);
  const start = useStartFormat(entryKey, href);
  const runId = view.run?._id ?? null;

  const [base, setBase] = useState<{ runId: string; html: string } | null>(null);
  useEffect(() => {
    if (view.result !== null && runId && base?.runId !== runId) setBase({ runId, html });
  }, [view.result, runId, base?.runId, html]);

  const hunks = useMemo(
    () =>
      base && base.runId === runId && view.result !== null
        ? diffWikiFormat(base.html, view.result)
        : null,
    [base, runId, view.result],
  );
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  useEffect(() => {
    setAccepted(hunks ? Object.fromEntries(hunks.map((h) => [h.id, h.formatted])) : {});
  }, [hunks]);

  if (!view.run) return null;
  const changed = hunks?.filter((h) => h.kind === "changed").length ?? 0;

  function retry() {
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_INSTRUCTIONS_KEY);
    } catch {
      // Falls through to the saved default.
    }
    const instructions = last || savedDefault;
    if (instructions) void start(html, instructions);
    else view.markSeen();
  }

  function apply() {
    if (!hunks) return;
    onApply(hunks.map((h) => accepted[h.id] ?? h.formatted).join(""));
    view.markSeen();
    toast.success(t("formatApplied"));
  }

  return (
    <div className="space-y-4">
      <AiRunCard
        view={view}
        titles={{ done: t("formatReviewTitle") }}
        bodies={
          hunks
            ? {
                done: changed ? t("formatReviewBody", { count: changed }) : t("formatNoChanges"),
              }
            : undefined
        }
        onRetry={retry}
        onDismiss={view.markSeen}
      />
      {hunks && (
        <>
          {base && base.html !== html && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              {t("formatStaleWarning")}
            </p>
          )}
          <div className="space-y-2">
            {hunks.map((hunk, index) => (
              <Hunk
                key={hunk.id}
                hunk={hunk}
                index={index}
                accepted={accepted[hunk.id] ?? hunk.formatted}
                onRevertToggle={() =>
                  setAccepted((prev) => ({
                    ...prev,
                    [hunk.id]:
                      (prev[hunk.id] ?? hunk.formatted) === hunk.original
                        ? hunk.formatted
                        : hunk.original,
                  }))
                }
                onEdit={(next) => setAccepted((prev) => ({ ...prev, [hunk.id]: next }))}
              />
            ))}
          </div>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border/60 bg-background/90 py-3 backdrop-blur">
            <Button variant="ghost" onClick={view.markSeen}>
              {t("formatAssistDiscard")}
            </Button>
            <Button onClick={apply} disabled={!changed}>
              {t("formatAssistApply")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
