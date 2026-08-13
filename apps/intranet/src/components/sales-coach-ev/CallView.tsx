"use client";

import { useEffect, useState } from "react";

import { Play, Square } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSalesCoachWiki } from "@/lib/sales-coach-ev-api";
import { cn } from "@/lib/utils";

import { CoachPanel } from "./CoachPanel";
import { fmtDuration } from "./constants";
import { ObjectionsTab } from "./ObjectionsTab";
import { ReportModal } from "./ReportModal";
import { ScriptTab } from "./ScriptTab";
import { TranscriptPanel } from "./TranscriptPanel";
import { useSalesCoachCall } from "./use-sales-coach-call";
import { WikiTab } from "./WikiTab";

export function CallView() {
  const t = useTranslations("SalesCoachEv");
  const call = useSalesCoachCall();
  const { articles: wikiArticles } = useSalesCoachWiki();
  const [lang, setLang] = useState("de-DE");
  const [assistTab, setAssistTab] = useState("script");
  const [wikiQuery, setWikiQuery] = useState("");
  const [reportOpen, setReportOpen] = useState(false);

  const isLive = call.status === "live";

  const handleWordClick = (word: string) => {
    setWikiQuery(word);
    setAssistTab("wiki");
  };

  // Jump the assist panel to Objections whenever a new one is detected in
  // the live transcript, mirroring the original's live keyword scan.
  useEffect(() => {
    if (call.detectedObjectionId) setAssistTab("objections");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.detectedObjectionId]);

  // Open the score report automatically as soon as it's ready, same as the
  // original (no extra click needed after a scored call finishes analysis).
  useEffect(() => {
    if (call.lastCall?.scored) setReportOpen(true);
  }, [call.lastCall]);

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[560px] flex-col overflow-hidden rounded-xl border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2.5">
        <Button
          type="button"
          size="sm"
          disabled={isLive}
          onClick={() => call.start(lang)}
          className="gap-1.5"
        >
          <Play className="size-3.5" />
          {t("startCall")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!isLive}
          onClick={call.stop}
          className="gap-1.5"
        >
          <Square className="size-3.5" />
          {t("endCall")}
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Select value={lang} onValueChange={setLang}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="de-DE">Deutsch</SelectItem>
            <SelectItem value="en-US">English</SelectItem>
          </SelectContent>
        </Select>
        <div className="mx-1 h-5 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "size-1.5 rounded-full bg-muted-foreground/40",
              isLive && "animate-pulse bg-emerald-500",
            )}
          />
          <span className="text-xs text-muted-foreground">
            {isLive
              ? t("statusLive")
              : call.status === "stopped"
                ? t("statusStopped")
                : t("statusReady")}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!call.lastCall}
          onClick={() => setReportOpen(true)}
          className="ml-1 text-xs"
        >
          {t("openReport")}
        </Button>
        <div className="ml-auto font-mono text-xs text-muted-foreground">
          {fmtDuration(call.elapsedSec)}
        </div>
      </div>

      {call.error && (
        <div className="mx-3.5 mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-[13px] text-destructive">
          {call.error}
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1fr_280px_280px]">
        <div className="flex flex-col overflow-hidden border-b border-border md:border-b-0 md:border-r">
          <TranscriptPanel
            transcript={call.transcript}
            interim={call.interim}
            onWordClick={handleWordClick}
          />
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
            <span>{t("wordCount", { count: call.wordCount })}</span>
            <span>{t("ramOnly")}</span>
          </div>
        </div>

        <CoachPanel
          evChecks={call.evChecks}
          detectedPath={call.detectedPath}
          hints={call.hints}
          thinking={call.thinking}
          outcome={call.outcome}
          onOutcomeChange={call.setOutcome}
        />

        <div className="flex flex-col overflow-hidden bg-card">
          <Tabs
            value={assistTab}
            onValueChange={setAssistTab}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <TabsList className="m-1.5 grid grid-cols-3">
              <TabsTrigger value="script" className="text-xs">
                {t("tabScript")}
              </TabsTrigger>
              <TabsTrigger value="objections" className="text-xs">
                {t("tabObjections")}
              </TabsTrigger>
              <TabsTrigger value="wiki" className="text-xs">
                {t("tabWikiShort")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="script" className="m-0 flex flex-1 flex-col overflow-hidden">
              <ScriptTab activePath={call.detectedPath} />
            </TabsContent>
            <TabsContent value="objections" className="m-0 flex flex-1 flex-col overflow-hidden">
              <ObjectionsTab detectedId={call.detectedObjectionId} />
            </TabsContent>
            <TabsContent value="wiki" className="m-0 flex flex-1 flex-col overflow-hidden">
              <WikiTab
                wikiArticles={wikiArticles ?? []}
                transcript={call.transcript}
                query={wikiQuery}
                onQueryChange={setWikiQuery}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <ReportModal call={call.lastCall} open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  );
}
