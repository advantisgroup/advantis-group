"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Copy, Loader2, Pencil, RotateCcw, Save, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { htmlToText, RichText } from "@/components/ui/rich-text";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";
import { diffWikiFormat, type FormatHunk } from "@/lib/wiki-format-diff";
import { useWikiFormatApi } from "@/lib/wiki-format-api";
import { cn } from "@/lib/utils";

/** One reviewable block of AI-reformatted content. Unchanged blocks render
 *  plainly; changed blocks show the (currently accepted) text with a
 *  compact icon-only action row — copy, revert to the original for just
 *  this block, or edit it directly — so nothing is applied without a
 *  manager having looked at it. */
function Hunk({
  hunk,
  accepted,
  onRevertToggle,
  onEdit,
}: {
  hunk: FormatHunk;
  accepted: string;
  onRevertToggle: () => void;
  onEdit: (html: string) => void;
}) {
  const t = useTranslations("Guidebooks");
  const [editing, setEditing] = useState(false);
  const reverted = accepted === hunk.original;

  if (hunk.kind === "unchanged") {
    return <RichText html={hunk.original} className="text-sm text-muted-foreground" />;
  }

  return (
    <div
      className={cn(
        "rounded-lg border px-2.5 py-2",
        reverted ? "border-border/60 bg-muted/20" : "border-signal/30 bg-signal/5",
      )}
    >
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
          onClick={onRevertToggle}
          className={cn(
            "flex size-6 items-center justify-center rounded transition-colors hover:bg-accent",
            reverted ? "text-signal" : "text-muted-foreground hover:text-foreground",
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

interface ReviewState {
  hunks: FormatHunk[];
  accepted: Record<string, string>;
}

/**
 * The "format with AI" trigger + review panel for a wiki entry body. Opt-in
 * via `RichTextEditor`'s `aiFormatSlot` render prop rather than baked into
 * that generic ui component, so this wiki-specific (Convex + /wiki/*
 * endpoint) piece stays out of a shared primitive.
 *
 * `inline` switches the trigger's own look from a floating pill (placed by
 * the caller inside a `relative` wrapper) to a plain toolbar icon — used
 * when `RichTextEditor` renders this inside its mobile docked toolbar bar,
 * where a floating button would sit under the keyboard.
 */
export function WikiAiFormatAssist({
  html,
  onApply,
  inline = false,
}: {
  html: string;
  onApply: (html: string) => void;
  inline?: boolean;
}) {
  const t = useTranslations("Guidebooks");
  const isMobile = useIsMobile();
  const handleError = useErrorHandler();
  const formatApi = useWikiFormatApi();
  const savedDefault = useQuery(api.wikiFormatSettings.get) ?? "";
  const saveDefault = useMutation(api.wikiFormatSettings.set);

  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [running, setRunning] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [review, setReview] = useState<ReviewState | null>(null);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setInstructions(savedDefault);
      setReview(null);
    }
  }

  async function onRun() {
    const trimmed = instructions.trim();
    if (!trimmed) {
      toast.error(t("formatAssistNeedsInstructions"));
      return;
    }
    setRunning(true);
    try {
      const { formattedHtml } = await formatApi.format(html, trimmed);
      const hunks = diffWikiFormat(html, formattedHtml);
      setReview({
        hunks,
        accepted: Object.fromEntries(hunks.map((h) => [h.id, h.formatted])),
      });
    } catch (e) {
      handleError(e);
    } finally {
      setRunning(false);
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

  function onApplyClick() {
    if (!review) return;
    onApply(review.hunks.map((h) => review.accepted[h.id] ?? h.formatted).join(""));
    setOpen(false);
  }

  const panelBody = (
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
          rows={3}
          className="text-sm"
        />
      </div>

      {!review && (
        <Button size="sm" className="w-full" onClick={() => void onRun()} disabled={running}>
          {running ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Wand2 className="mr-1.5 size-3.5" />
          )}
          {running ? t("formatAssistRunning") : t("formatAssistCta")}
        </Button>
      )}

      {review && (
        <>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {review.hunks.map((hunk) => (
              <Hunk
                key={hunk.id}
                hunk={hunk}
                accepted={review.accepted[hunk.id] ?? hunk.formatted}
                onRevertToggle={() =>
                  setReview((s) =>
                    s
                      ? {
                          ...s,
                          accepted: {
                            ...s.accepted,
                            [hunk.id]:
                              s.accepted[hunk.id] === hunk.original ? hunk.formatted : hunk.original,
                          },
                        }
                      : s,
                  )
                }
                onEdit={(next) =>
                  setReview((s) => (s ? { ...s, accepted: { ...s.accepted, [hunk.id]: next } } : s))
                }
              />
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
            <Button variant="ghost" size="sm" onClick={() => setReview(null)}>
              {t("formatAssistDiscard")}
            </Button>
            <Button size="sm" onClick={onApplyClick}>
              {t("formatAssistApply")}
            </Button>
          </div>
        </>
      )}
    </div>
  );

  const triggerClassName = inline
    ? "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-[17px]"
    : "absolute bottom-3 right-3 z-10 flex size-10 items-center justify-center rounded-full bg-signal text-signal-foreground shadow-lg transition-transform hover:scale-105 [&_svg]:size-[18px]";

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          title={t("formatAssistCta")}
          aria-label={t("formatAssistCta")}
          onClick={() => onOpenChange(true)}
          className={triggerClassName}
        >
          <Wand2 />
        </button>
        <MobileDrawer open={open} onOpenChange={onOpenChange} ariaLabel={t("formatAssistCta")}>
          <div className="border-b border-border/70 px-5 pb-3">
            <p className="font-display text-lg font-semibold leading-tight tracking-tight">
              {t("formatAssistCta")}
            </p>
          </div>
          <div className="overflow-y-auto px-5 py-4">{panelBody}</div>
        </MobileDrawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("formatAssistCta")}
          aria-label={t("formatAssistCta")}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          className={triggerClassName}
        >
          <Wand2 />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        {panelBody}
      </PopoverContent>
    </Popover>
  );
}
