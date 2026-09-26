"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  ArrowUp,
  ChevronRight,
  ExternalLink,
  FileText,
  RotateCcw,
  ScrollText,
  Square,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { SidePanel, SidePanelSection } from "@/components/ui/side-panel";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIntranetApiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { AiGlyph } from "./AiGlyph";
import { AiMarkdown } from "./AiMarkdown";
import { aiErrorKey } from "./AiRunCard";
import { AiReveal } from "./AiReveal";
import { AiRunStats, AiThinking } from "./AiThinking";
import { AiDisclosure, AiDisclosureText } from "./AiTranscriptView";
import { type AskSubject, useAskOpen } from "./ask-subject";
import { useAiEnabled } from "./use-ai-enabled";
import { useAiRun } from "./use-ai-run";

const STARTER_KEYS = {
  itTicket: ["ticketSummary", "ticketNext", "ticketHistory"],
  applicant: ["applicantSummary", "applicantFit", "applicantGaps"],
  announcement: ["announcementSummary", "announcementForMe", "announcementDates"],
  errorReport: ["errorSummary", "errorNext", "errorCause"],
  suggestion: ["suggestionSummary", "suggestionDecision", "suggestionImpact"],
} as const;

/** One thing the model was given, named plainly. */
function Chip({ label, href }: { label: string; href?: string }) {
  const className =
    "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[12px] text-muted-foreground";
  if (!href) return <span className={className}>{label}</span>;
  return (
    <Link href={href} className={`${className} transition-colors hover:bg-accent`}>
      <span className="truncate">{label}</span>
      <ExternalLink className="size-3 shrink-0" />
    </Link>
  );
}

/**
 * The request itself, word for word, before anything is sent: the rules the
 * model is given and the record as text. Built by apps/api with the same code
 * as the real request, so it can't drift from it.
 */
function ExactPreview({ subject, question }: { subject: AskSubject; question: string }) {
  const t = useTranslations("Ai");
  const apiClient = useIntranetApiClient();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<
    { system: string; record: string } | "loading" | "error" | null
  >(null);

  useEffect(() => {
    setPreview(null);
    setOpen(false);
  }, [subject.type, subject.id]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || (preview && preview !== "error")) return;
    setPreview("loading");
    const params = new URLSearchParams({ type: subject.type, id: subject.id });
    apiClient
      .fetchJson<{ system: string; record: string }>(`/ask/preview?${params}`)
      .then(setPreview)
      .catch(() => setPreview("error"));
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        {t("ask.previewToggle")}
      </button>
      {open && (
        <div className="mt-2.5 space-y-2">
          {preview === "loading" || preview === null ? (
            <p className="text-xs text-muted-foreground">{t("ask.contextLoading")}</p>
          ) : preview === "error" ? (
            <p className="text-xs text-destructive">{t("history.loadFailed")}</p>
          ) : (
            <>
              {/* The same pieces, in the same order, as the run's conversation
                  in the AI history will show them afterwards. */}
              <AiDisclosure
                icon={ScrollText}
                title={t("history.turn.instructions")}
                meta={t("chars", { count: preview.system.length })}
              >
                <AiDisclosureText>{preview.system}</AiDisclosureText>
              </AiDisclosure>
              <AiDisclosure
                icon={FileText}
                title={t("ask.previewRecord")}
                meta={t("chars", { count: preview.record.length })}
              >
                <AiDisclosureText>{preview.record}</AiDisclosureText>
              </AiDisclosure>
              <p className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-3.5 py-2 text-[13px]">
                {`Question: ${question.trim() || t("ask.previewQuestionPlaceholder")}`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AskBody({ subject, onClose }: { subject: AskSubject; onClose: () => void }) {
  const t = useTranslations("Ai");
  const apiClient = useIntranetApiClient();
  const handleError = useErrorHandler();
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const preview = useQuery(api.aiRuns.askPreview, { type: subject.type, id: subject.id });
  const view = useAiRun({ subjectKey: `ask:${subject.type}:${subject.id}` });
  const working = view.state === "working" || sending;
  // Sources the run actually recorded win over the preview: same shape, but
  // they're what was really sent rather than what was going to be.
  const sources = view.run?.sources.length ? view.run.sources : (preview?.sources ?? []);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || working) return;
    setSending(true);
    try {
      await apiClient.fetchJson<{ runId: string }>("/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: subject.type, id: subject.id, question: trimmed }),
      });
      setAsked(trimmed);
      setQuestion("");
    } catch (err) {
      handleError(err);
    } finally {
      setSending(false);
    }
  }

  const failed =
    view.state === "error" || view.state === "interrupted" || view.state === "cancelled";

  return (
    <>
      <SidePanelSection title={t("ask.contextTitle")}>
        <div className="flex flex-wrap gap-1.5">
          {sources.length > 0 ? (
            sources.map((source) => (
              <Chip key={source.label} label={source.label} href={source.href} />
            ))
          ) : (
            <span className="text-[13px] text-muted-foreground">{t("ask.contextLoading")}</span>
          )}
        </div>
        <p className="mt-2.5 text-xs text-muted-foreground">{t("ask.contextHint")}</p>
        <ExactPreview subject={subject} question={question} />
      </SidePanelSection>

      <SidePanelSection title={t("ask.answerTitle")}>
        {asked && (
          <p className="mb-3 border-l-2 border-border pl-3 text-[13px] text-muted-foreground">
            {asked}
          </p>
        )}
        {working ? (
          <div className="text-sm leading-relaxed">
            {view.text && !sending ? (
              <AiReveal text={view.text} />
            ) : (
              <AiThinking phase={view.run?.phase} elapsedSec={view.elapsedSec} />
            )}
          </div>
        ) : failed ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">
              {view.state === "error"
                ? t(aiErrorKey(view.run?.errorCode ?? null))
                : view.state === "cancelled"
                  ? t("cancelledBody")
                  : t("interruptedBody")}
            </span>
          </div>
        ) : view.text ? (
          <div className="text-sm leading-relaxed">
            <AiMarkdown>{view.text}</AiMarkdown>
            {view.run && <AiRunStats run={view.run} className="mt-2" />}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {STARTER_KEYS[subject.type].map((key, index) => (
              <button
                key={key}
                type="button"
                onClick={() => void ask(t(`ask.starter.${key}`))}
                className="ai-rise rounded-xl border border-border/70 bg-card px-3.5 py-2.5 text-left text-[13px] transition-colors hover:bg-accent"
                style={{ ["--i" as string]: index }}
              >
                {t(`ask.starter.${key}`)}
              </button>
            ))}
          </div>
        )}
      </SidePanelSection>

      <div className="sticky bottom-0 -mx-5 border-t border-border/60 bg-card px-5 py-3">
        <div
          data-working={working}
          className="ai-orbit flex items-end gap-2 rounded-2xl border border-border bg-card p-1.5 pl-3.5 focus-within:border-ring/60"
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(question);
              }
            }}
            placeholder={t("ask.placeholder")}
            className="max-h-32 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          {working ? (
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("stop")}
              onClick={() => view.cancel()}
            >
              <Square className="size-3.5" />
            </Button>
          ) : (
            <Button
              size="icon"
              aria-label={t("ask.send")}
              disabled={!question.trim()}
              onClick={() => void ask(question)}
            >
              <ArrowUp />
            </Button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">{t("ask.disclaimer")}</p>
          {failed && asked && (
            <Button size="xs" variant="outline" onClick={() => void ask(asked)}>
              <RotateCcw />
              {t("retry")}
            </Button>
          )}
          {preview?.href && (
            <Button size="xs" variant="ghost" asChild onClick={onClose}>
              <Link href={preview.href}>{t("ask.openRecord")}</Link>
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Asking about the record you're looking at, without leaving it. Everything
 * the model is given is listed as a chip above the answer — the panel never
 * sends anything it doesn't show, and the record itself is read on the server
 * under your own access, not passed along by the browser.
 */
export function AskPanel() {
  const t = useTranslations("Ai");
  const tc = useTranslations("Common");
  const { open, close } = useAskOpen();
  const aiEnabled = useAiEnabled();

  if (!open || !aiEnabled) return null;

  return (
    <SidePanel
      open
      onOpenChange={(next) => !next && close()}
      title={t("ask.title")}
      closeLabel={tc("close")}
      header={
        <div className="flex items-center gap-2.5 pr-8">
          <AiGlyph className="size-4" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              <span className="ai-text">{t("ask.title")}</span>
            </p>
            <h2 className="truncate text-[15px] font-semibold tracking-tight">{open.label}</h2>
          </div>
        </div>
      }
    >
      <AskBody subject={open} onClose={close} />
    </SidePanel>
  );
}
