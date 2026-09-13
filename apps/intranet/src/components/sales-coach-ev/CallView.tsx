"use client";

import { useEffect, useState } from "react";

import { FileText, Mic, Square } from "lucide-react";
import { useTranslations } from "next-intl";

import { AiRunCard } from "@/components/ai/AiRunCard";
import { useAiRun } from "@/components/ai/use-ai-run";
import { useFillPage } from "@/components/layout/fill-page";
import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSalesCoachWiki } from "@/lib/sales-coach-ev-api";
import { cn } from "@/lib/utils";

import { CoachPanel } from "./CoachPanel";
import { fmtDuration } from "./constants";
import { ObjectionsTab } from "./ObjectionsTab";
import { ScriptTab } from "./ScriptTab";
import { TranscriptPanel } from "./TranscriptPanel";
import { useSalesCoachCall } from "./use-sales-coach-call";
import { WikiTab } from "./WikiTab";

type RailTab = "coach" | "script" | "objections" | "wiki";

/** The report for the call that just ended, scored in the background — the
 * rep can start the next call while it's written, and open it when it lands. */
function LastCallReport({ callId }: { callId: string }) {
  const t = useTranslations("SalesCoachEv");
  const view = useAiRun({ subjectKey: `coachReport:${callId}` });
  if (!view.run) return null;
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pt-4 md:px-8">
      <AiRunCard
        view={view}
        titles={{ working: t("reportWaitingTitle"), done: t("reportReady") }}
        className="p-3"
      >
        <Button size="sm" asChild>
          <Link href={`/sales-coach-ev/progress/${callId}`} onClick={view.markSeen}>
            {t("reportOpen")}
          </Link>
        </Button>
      </AiRunCard>
    </div>
  );
}

export function CallView() {
  const t = useTranslations("SalesCoachEv");
  const isMobile = useIsMobile();
  const call = useSalesCoachCall();
  const { articles: wikiArticles } = useSalesCoachWiki();
  const [lang, setLang] = useState("de-DE");
  const [tab, setTab] = useState<RailTab>("coach");
  const [wikiQuery, setWikiQuery] = useState("");

  // On desktop the call is one full-height workspace; on a phone it scrolls
  // like a page so the bottom navigation stays reachable.
  useFillPage(!isMobile);

  const isLive = call.status === "live";

  const handleWordClick = (word: string) => {
    setWikiQuery(word);
    setTab("wiki");
  };

  // Jump to Objections whenever a new one is detected in the live transcript.
  useEffect(() => {
    if (call.detectedObjectionId) setTab("objections");
  }, [call.detectedObjectionId]);

  const tabs: { value: RailTab; label: string; count?: number }[] = [
    { value: "coach", label: t("liveCoaching"), count: call.hints.length || undefined },
    { value: "script", label: t("tabScript") },
    { value: "objections", label: t("tabObjections") },
    { value: "wiki", label: t("tabWikiShort") },
  ];

  return (
    <div className="flex min-h-0 flex-col md:h-full md:flex-row">
      <section className="flex min-h-[55vh] min-w-0 flex-1 flex-col md:min-h-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/70 px-5 py-3 md:px-8">
          <Button
            type="button"
            size="lg"
            variant={isLive ? "outline" : "default"}
            onClick={() => (isLive ? call.stop() : call.start(lang))}
            className="gap-2 rounded-full px-5"
          >
            {isLive ? <Square className="size-4" /> : <Mic className="size-4" />}
            {isLive ? t("endCall") : t("startCall")}
          </Button>
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "font-mono text-2xl tabular-nums tracking-tight",
                !isLive && "text-muted-foreground",
              )}
            >
              {fmtDuration(call.elapsedSec)}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  "size-1.5 rounded-full bg-muted-foreground/40",
                  isLive && "animate-pulse bg-success",
                )}
              />
              {isLive
                ? t("statusLive")
                : call.status === "stopped"
                  ? t("statusStopped")
                  : t("statusReady")}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Select value={lang} onValueChange={setLang} disabled={isLive}>
              <SelectTrigger className="h-8 w-28 text-xs" aria-label={t("language")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="de-DE">Deutsch</SelectItem>
                <SelectItem value="en-US">English</SelectItem>
              </SelectContent>
            </Select>
            {call.lastCallId && (
              <Button type="button" size="sm" variant="ghost" asChild>
                <Link href={`/sales-coach-ev/progress/${call.lastCallId}`}>
                  <FileText />
                  {t("openReport")}
                </Link>
              </Button>
            )}
          </div>
        </div>

        {call.error && (
          <div className="mx-auto mt-4 w-full max-w-3xl px-5 md:px-8">
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-[13px] text-destructive">
              {call.error}
            </p>
          </div>
        )}

        {call.lastCallId && !isLive && <LastCallReport callId={call.lastCallId} />}

        <TranscriptPanel
          transcript={call.transcript}
          interim={call.interim}
          live={isLive}
          onWordClick={handleWordClick}
        />

        <div className="flex items-center justify-between border-t border-border/70 px-5 py-2 text-xs text-muted-foreground md:px-8">
          <span className="tabular-nums">{t("wordCount", { count: call.wordCount })}</span>
          <span>{t("ramOnly")}</span>
        </div>
      </section>

      <aside className="flex min-h-[60vh] flex-col border-t border-border/70 md:min-h-0 md:w-[380px] md:shrink-0 md:border-l md:border-t-0 xl:w-[420px]">
        <div
          role="tablist"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/70 px-3 py-2 [scrollbar-width:none]"
        >
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              onClick={() => setTab(item.value)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                tab === item.value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {item.label}
              {item.count !== undefined && (
                <span className="tabular-nums opacity-70">{item.count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {tab === "coach" && (
            <CoachPanel
              evChecks={call.evChecks}
              detectedPath={call.detectedPath}
              hints={call.hints}
              thinking={call.thinking}
              outcome={call.outcome}
              onOutcomeChange={call.setOutcome}
            />
          )}
          {tab === "script" && <ScriptTab activePath={call.detectedPath} />}
          {tab === "objections" && <ObjectionsTab detectedId={call.detectedObjectionId} />}
          {tab === "wiki" && (
            <WikiTab
              wikiArticles={wikiArticles ?? []}
              transcript={call.transcript}
              query={wikiQuery}
              onQueryChange={setWikiQuery}
            />
          )}
        </div>
      </aside>
    </div>
  );
}
