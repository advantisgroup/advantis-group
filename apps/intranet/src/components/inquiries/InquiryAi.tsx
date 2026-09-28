"use client";

import { useEffect, useState } from "react";

import { type Id } from "@advantis/convex/dataModel";
import { CornerDownLeft, Info, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { AiButton } from "@/components/ai/AiButton";
import { aiErrorKey } from "@/components/ai/AiRunCard";
import { AiRunDetail } from "@/components/ai/AiRunDetail";
import { AiReveal } from "@/components/ai/AiReveal";
import { AiThinking } from "@/components/ai/AiThinking";
import { useAiEnabled } from "@/components/ai/use-ai-enabled";
import { useAiRun } from "@/components/ai/use-ai-run";
import { Button } from "@/components/ui/button";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIntranetApiClient } from "@/lib/api-client";

type Mode = "summary" | "draft";

/**
 * Claude on one inquiry: a few sentences on where it stands, or a reply
 * draft in the customer's language that goes into the reply box for editing
 * — never straight to the customer. Each only runs when asked; the last one
 * is simply there next time the page opens.
 */
export function InquiryAi({
  id,
  signOff,
  onUseDraft,
}: {
  id: Id<"emails">;
  /** The first name the draft is signed with. */
  signOff: string;
  onUseDraft: (text: string) => void;
}) {
  const t = useTranslations("Inquiries.ai");
  const enabled = useAiEnabled();
  if (!enabled) return null;

  return (
    <section>
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("title")}
      </h2>
      <AiPart id={id} mode="summary" signOff={signOff} />
      <AiPart id={id} mode="draft" signOff={signOff} onUseDraft={onUseDraft} />
    </section>
  );
}

function AiPart({
  id,
  mode,
  signOff,
  onUseDraft,
}: {
  id: Id<"emails">;
  mode: Mode;
  signOff: string;
  onUseDraft?: (text: string) => void;
}) {
  const t = useTranslations("Inquiries.ai");
  const ta = useTranslations("Ai");
  const locale = useLocale();
  const apiClient = useIntranetApiClient();
  const handleError = useErrorHandler();
  const view = useAiRun({
    subjectKey: `${mode === "draft" ? "inquiryDraft" : "inquirySummary"}:${id}`,
  });
  const [sending, setSending] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const working = sending || view.state === "working";
  const failed =
    view.state === "error" || view.state === "interrupted" || view.state === "cancelled";

  useEffect(() => {
    if (view.state === "done") view.markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.state, view.run?._id]);

  async function start() {
    if (working) return;
    setSending(true);
    try {
      await apiClient.fetchJson<{ runId: string }>(`/inquiries/${id}/ai`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, locale, signOff }),
      });
    } catch (err) {
      handleError(err);
    } finally {
      setSending(false);
    }
  }

  const hasText = !view.loading && Boolean(view.text) && !failed;

  return (
    <div className="mt-3 rounded-lg border border-border/70 px-3 py-2.5" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{t(`${mode}.title`)}</span>
        {view.run && !working ? (
          <span className="-mr-1.5 flex items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("details")}
              className="text-muted-foreground"
              onClick={() => setDetailOpen(true)}
            >
              <Info className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("again")}
              className="text-muted-foreground"
              onClick={() => void start()}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </span>
        ) : null}
      </div>

      <div className="mt-1.5">
        {view.loading ? null : hasText ? (
          <>
            <AiReveal
              text={view.text!}
              className="whitespace-pre-wrap text-[13px] leading-relaxed text-pretty"
            />
            {mode === "draft" && view.state === "done" && onUseDraft ? (
              <Button
                size="xs"
                variant="outline"
                className="mt-2"
                onClick={() => onUseDraft(view.text!)}
              >
                <CornerDownLeft />
                {t("draft.use")}
              </Button>
            ) : null}
          </>
        ) : working ? (
          <AiThinking phase={view.run?.phase} elapsedSec={view.elapsedSec} />
        ) : failed ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">
              {view.state === "error"
                ? ta(aiErrorKey(view.run?.errorCode ?? null))
                : view.state === "cancelled"
                  ? ta("cancelledBody")
                  : ta("interruptedBody")}
            </p>
            <Button size="xs" variant="outline" onClick={() => void start()}>
              <RotateCcw />
              {ta("retry")}
            </Button>
          </div>
        ) : (
          <div>
            <p className="text-xs leading-5 text-muted-foreground">{t(`${mode}.prompt`)}</p>
            <AiButton className="mt-2" onClick={() => void start()}>
              {t(`${mode}.start`)}
            </AiButton>
          </div>
        )}
      </div>

      {detailOpen && (
        <AiRunDetail run={view.run} onOpenChange={(open) => !open && setDetailOpen(false)} />
      )}
    </div>
  );
}
