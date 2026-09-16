"use client";

import { useEffect, useState } from "react";

import { Info, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { AiButton } from "@/components/ai/AiButton";
import { AiGlyph } from "@/components/ai/AiGlyph";
import { aiErrorKey } from "@/components/ai/AiRunCard";
import { AiRunDetail } from "@/components/ai/AiRunDetail";
import { AiReveal } from "@/components/ai/AiReveal";
import { AiRunStats, AiThinking } from "@/components/ai/AiThinking";
import { useAiRun } from "@/components/ai/use-ai-run";
import { Button } from "@/components/ui/button";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { isoToday } from "@/lib/absences";
import { useIntranetApiClient } from "@/lib/api-client";

/**
 * A few sentences on the day, written by Claude from what the rest of the
 * page already shows. One per day; it only runs when asked, and after that
 * it's simply there whenever the page is opened again.
 */
export function AiBriefCard() {
  const t = useTranslations("Dashboard");
  const ta = useTranslations("Ai");
  const locale = useLocale();
  const apiClient = useIntranetApiClient();
  const handleError = useErrorHandler();
  const day = isoToday();
  const view = useAiRun({ subjectKey: `dailyBrief:${day}` });
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
      await apiClient.fetchJson<{ runId: string }>("/daily-brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ day, locale }),
      });
    } catch (err) {
      handleError(err);
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-live="polite" className="rounded-2xl border border-border/70 bg-card">
      <div className="px-5 py-4">
        <div className="flex items-center gap-2.5">
          <AiGlyph working={working} className="size-[18px]" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
            {t("briefTitle")}
          </h2>
          {view.run && !working && (
            <div className="-mr-2 flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("briefDetails")}
                className="text-muted-foreground"
                onClick={() => setDetailOpen(true)}
              >
                <Info className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("briefRefresh")}
                className="text-muted-foreground"
                onClick={() => void start()}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </div>
          )}
        </div>

        <div className="mt-2.5 min-h-6">
          {view.loading ? null : view.text && !failed ? (
            <>
              <AiReveal
                text={view.text}
                className="max-w-3xl text-[15px] leading-relaxed text-pretty"
              />
              {view.run && <AiRunStats run={view.run} className="mt-2.5" />}
            </>
          ) : working ? (
            <AiThinking phase={view.run?.phase} elapsedSec={view.elapsedSec} />
          ) : failed ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-[13.5px] text-muted-foreground">
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
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
              <p className="max-w-xl text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
                {t("briefPrompt")}
              </p>
              <AiButton onClick={() => void start()}>{t("briefStart")}</AiButton>
            </div>
          )}
        </div>
      </div>

      {detailOpen && (
        <AiRunDetail run={view.run} onOpenChange={(open) => !open && setDetailOpen(false)} />
      )}
    </section>
  );
}
