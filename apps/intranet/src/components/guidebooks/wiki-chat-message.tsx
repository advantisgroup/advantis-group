"use client";

import { type ReactNode, useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  Copy,
  FileText,
  Globe,
  Image as ImageIcon,
  LayoutList,
  Link2,
  Pencil,
  RotateCcw,
  Search,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { AiDots } from "@/components/ai/AiGlyph";
import { AiMarkdown, type AiMarkdownComponents } from "@/components/ai/AiMarkdown";
import { AiRunStats, AiThinking } from "@/components/ai/AiThinking";
import { type AiRunMeta, type AiRunPhase } from "@/components/ai/use-ai-run";
import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIntranetApiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** Something an answer points at: an in-app path or a web page. Same shape
 * apps/api's wiki-chat route writes. */
export interface ChatLink {
  title: string;
  href: string;
}

export interface ChatStep {
  id: string;
  tool: "wiki" | "search" | "open" | "overview" | "web" | "think";
  kind?: string;
  query?: string;
  text?: string;
  results: ChatLink[];
  done: boolean;
  failed?: boolean;
}

export interface ChatAttachment {
  name: string;
  mediaType: string;
  size: number;
  /** Set once it's stored — how a sent image is fetched back. */
  storageId?: string;
  /** A local blob URL, for an image picked in this tab. */
  preview?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
  steps?: ChatStep[];
  sources?: ChatLink[];
  runId?: string;
}

const STEP_ICON = {
  wiki: BookOpen,
  search: Search,
  open: FileText,
  overview: LayoutList,
  web: Globe,
  think: Brain,
};

const isInternal = (href: string) => href.startsWith("/") && !href.startsWith("//");

function site(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Web citations arrive as links titled "cite" and become small pills, like
 * Claude's own; in-app links open in place. */
const CHAT_MARKDOWN: AiMarkdownComponents = {
  a: ({ href, title, children }) => {
    if (!href) return <>{children}</>;
    if (title === "cite") {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mx-0.5 inline-flex h-[18px] -translate-y-px items-center rounded-full bg-muted px-1.5 align-middle text-[11px] font-medium leading-none text-muted-foreground no-underline transition-colors hover:bg-accent hover:text-foreground"
        >
          {children}
        </a>
      );
    }
    if (isInternal(href)) {
      return (
        <Link
          href={href}
          className="font-medium underline decoration-foreground/25 underline-offset-[3px] transition-colors hover:decoration-foreground"
        >
          {children}
        </Link>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-foreground/25 underline-offset-[3px] transition-colors hover:decoration-foreground"
      >
        {children}
      </a>
    );
  },
};

/** The answer without its citation pills, for the clipboard. */
function plainAnswer(content: string) {
  return content.replace(/ \[[^\]]*\]\(<[^>]*> "cite"\)/g, "");
}

function ResultLink({ link }: { link: ChatLink }) {
  const className =
    "flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-[13px] text-foreground/90 transition-colors hover:bg-muted";
  const body = (
    <>
      <span className="min-w-0 flex-1 truncate">{link.title}</span>
      {!isInternal(link.href) && (
        <span className="shrink-0 text-xs text-muted-foreground">{site(link.href)}</span>
      )}
    </>
  );
  return isInternal(link.href) ? (
    <Link href={link.href} className={className}>
      {body}
    </Link>
  ) : (
    <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
      {body}
    </a>
  );
}

function useStepLabel() {
  const t = useTranslations("Guidebooks.wikiChat.steps");
  return (step: ChatStep) => ({
    verb: t(`${step.tool}.${step.done ? "done" : "running"}`, {
      kind: t(`kind.${step.kind ?? "wiki"}`),
    }),
    detail:
      step.tool === "think"
        ? step.text?.split("\n")[0]
        : step.tool === "overview"
          ? undefined
          : step.query,
  });
}

/**
 * What the assistant looked up, as one quiet line that opens into the full
 * list — the latest step while it works, the last one once it's done.
 */
function ChatSteps({ steps, working }: { steps: ChatStep[]; working: boolean }) {
  const t = useTranslations("Guidebooks.wikiChat.steps");
  const label = useStepLabel();
  const [open, setOpen] = useState(false);
  const last = steps.at(-1);
  if (!last) return null;
  const active = working && !last.done;
  const head = label(last);
  const HeadIcon = STEP_ICON[last.tool];

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex max-w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {active ? <AiDots /> : <HeadIcon className="size-3.5 shrink-0" />}
        <span className={cn("shrink-0", active && "ai-shimmer")}>{head.verb}</span>
        {head.detail && <span className="min-w-0 truncate text-foreground/80">{head.detail}</span>}
        {steps.length > 1 && (
          <span className="shrink-0 text-xs">{t("more", { count: steps.length - 1 })}</span>
        )}
        <ChevronRight
          className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
        />
      </button>

      {open && (
        <div className="ai-rise mt-2 space-y-1 rounded-xl border border-border/70 bg-card/60 p-1.5">
          {steps.map((step) => {
            const Icon = STEP_ICON[step.tool];
            const { verb, detail } = label(step);
            return (
              <div key={step.id} className="px-1 py-0.5">
                <div className="flex items-center gap-2 px-1 py-1 text-[13px]">
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="shrink-0 text-muted-foreground">{verb}</span>
                  {detail && <span className="min-w-0 truncate">{detail}</span>}
                  <span className="ml-auto shrink-0 pl-2 text-xs tabular-nums text-muted-foreground">
                    {step.failed
                      ? t("failed")
                      : step.done && step.tool !== "open" && step.tool !== "think"
                        ? t("results", { count: step.results.length })
                        : null}
                  </span>
                </div>
                {step.tool === "think" && step.text && (
                  <p className="ml-4 max-h-48 overflow-y-auto whitespace-pre-wrap border-l border-border/70 py-0.5 pl-3.5 text-[13px] leading-relaxed text-muted-foreground">
                    {step.text}
                  </p>
                )}
                {step.tool !== "open" && step.results.length > 0 && (
                  <div className="ml-4 border-l border-border/70 pl-1.5">
                    {step.results.slice(0, 6).map((link) => (
                      <ResultLink key={link.href} link={link} />
                    ))}
                    {step.results.length > 6 && (
                      <p className="px-2 py-0.5 text-xs text-muted-foreground">
                        {t("moreResults", { count: step.results.length - 6 })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-3.5",
            active && "text-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function Feedback({ runId }: { runId: Id<"aiRuns"> }) {
  const t = useTranslations("Guidebooks.wikiChat");
  const saved = useQuery(api.aiRuns.myFeedback, { runId });
  const rateRun = useMutation(api.aiRuns.rateRun);
  return (
    <>
      <IconAction
        label={t("goodAnswer")}
        active={saved?.rating === "up"}
        onClick={() => void rateRun({ runId, rating: "up" })}
      >
        <ThumbsUp className={cn(saved?.rating === "up" && "fill-current")} />
      </IconAction>
      <IconAction
        label={t("badAnswer")}
        active={saved?.rating === "down"}
        onClick={() => void rateRun({ runId, rating: "down" })}
      >
        <ThumbsDown className={cn(saved?.rating === "down" && "fill-current")} />
      </IconAction>
    </>
  );
}

function SourcesButton({ sources }: { sources: ChatLink[] }) {
  const t = useTranslations("Guidebooks.wikiChat");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ml-1 flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Link2 className="size-3.5" />
          {t("sources", { count: sources.length })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1.5">
        {sources.map((link) => (
          <ResultLink key={link.href} link={link} />
        ))}
      </PopoverContent>
    </Popover>
  );
}

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** One file, sent or on its way: a thumbnail or type icon, its name and size —
 * or how far the upload is. */
export function AttachmentChip({
  attachment,
  preview,
  progress,
  failed,
  onRemove,
}: {
  attachment: ChatAttachment;
  preview?: string;
  progress?: number;
  failed?: boolean;
  onRemove?: () => void;
}) {
  const t = useTranslations("Guidebooks.wikiChat");
  const Icon = attachment.mediaType.startsWith("image/") ? ImageIcon : FileText;
  return (
    <div
      className={cn(
        "flex w-52 max-w-full items-center gap-2 rounded-xl border bg-card py-1.5 pl-1.5 pr-2",
        failed ? "border-destructive/40" : "border-border/70",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
        {preview ? (
          // A local blob preview — next/image has nothing to optimise here.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-full object-cover" />
        ) : (
          <Icon className="size-4" />
        )}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-xs font-medium">{attachment.name}</span>
        <span
          className={cn(
            "block text-[11px] tabular-nums",
            failed ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {failed
            ? t("uploadFailed")
            : progress !== undefined && progress < 1
              ? `${Math.round(progress * 100)} %`
              : fileSize(attachment.size)}
        </span>
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("removeFile")}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

// Unsealed images for this session, so reopening a chat doesn't fetch them
// again or flash empty boxes. Keyed by storage id, which never changes.
const imageUrls = new Map<string, Promise<string>>();

/** An image just sent from this tab already has a local preview — use it for
 * the stored message too instead of fetching the same picture back. */
export function rememberImage(storageId: string, url: string) {
  imageUrls.set(storageId, Promise.resolve(url));
}

function useImageUrl(chatId: string | null, attachment: ChatAttachment) {
  const apiClient = useIntranetApiClient();
  const [url, setUrl] = useState<string | null>(attachment.preview ?? null);
  const { storageId, preview } = attachment;

  useEffect(() => {
    if (preview) {
      setUrl(preview);
      return;
    }
    if (!chatId || !storageId) return;
    let active = true;
    let pending = imageUrls.get(storageId);
    if (!pending) {
      pending = apiClient
        .fetchBlob(`/wiki-chat/chats/${chatId}/files/${storageId}`)
        .then((blob) => URL.createObjectURL(blob));
      imageUrls.set(storageId, pending);
      // A failed fetch shouldn't stick — the next mount tries again.
      pending.catch(() => imageUrls.delete(storageId));
    }
    pending.then((next) => active && setUrl(next)).catch(() => {});
    return () => {
      active = false;
    };
  }, [apiClient, chatId, storageId, preview]);

  return url;
}

/** An image sent with a question: a thumbnail that opens full size. */
function SentImage({ chatId, attachment }: { chatId: string | null; attachment: ChatAttachment }) {
  const url = useImageUrl(chatId, attachment);
  const [open, setOpen] = useState(false);

  if (!url) {
    return (
      <span className="flex size-32 animate-pulse items-center justify-center rounded-xl border border-border/70 bg-muted text-muted-foreground">
        <ImageIcon className="size-5" />
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={attachment.name}
        className="overflow-hidden rounded-xl border border-border/70 transition-opacity hover:opacity-90"
      >
        {/* A blob URL — next/image has nothing to optimise here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={attachment.name} className="h-32 max-w-[16rem] object-cover" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl p-2 sm:p-3">
          <DialogTitle className="sr-only">{attachment.name}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={attachment.name}
            className="max-h-[80vh] w-full rounded-lg object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A question, with copy and — while nothing's being answered — edit, which
 * asks it again in place of the original and everything after it. */
export function UserMessage({
  chatId,
  content,
  attachments = [],
  onEdit,
}: {
  chatId: string | null;
  content: string;
  attachments?: ChatAttachment[];
  onEdit?: (text: string) => void;
}) {
  const t = useTranslations("Guidebooks.wikiChat");
  const tc = useTranslations("Common");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [copied, setCopied] = useState(false);

  function send() {
    const text = draft.trim();
    if (!text || !onEdit) return;
    setEditing(false);
    onEdit(text);
  }

  if (editing) {
    return (
      <div className="ml-auto w-full max-w-[85%] rounded-2xl border border-border bg-card p-2 shadow-sm focus-within:border-ring/50">
        <textarea
          autoFocus
          value={draft}
          rows={Math.min(8, draft.split("\n").length + 1)}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
            if (e.key === "Escape") setEditing(false);
          }}
          className="block w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed outline-none"
        />
        <div className="flex items-center justify-end gap-2 pt-1">
          <p className="mr-auto px-2 text-xs text-muted-foreground">{t("editHint")}</p>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            {tc("cancel")}
          </Button>
          <Button size="sm" disabled={!draft.trim()} onClick={send}>
            {t("sendEdit")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/question flex flex-col items-end">
      {attachments.length > 0 && (
        <div className="mb-1.5 flex max-w-[85%] flex-wrap justify-end gap-1.5">
          {attachments.map((attachment, i) =>
            attachment.mediaType.startsWith("image/") ? (
              <SentImage key={i} chatId={chatId} attachment={attachment} />
            ) : (
              <AttachmentChip key={i} attachment={attachment} />
            ),
          )}
        </div>
      )}
      {content && (
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-2.5 text-[15px] leading-relaxed">
          {content}
        </div>
      )}
      <div className="mt-1 flex items-center gap-0.5 transition-opacity md:opacity-0 md:group-focus-within/question:opacity-100 md:group-hover/question:opacity-100">
        <IconAction
          label={copied ? t("copied") : t("copy")}
          onClick={() => {
            void navigator.clipboard.writeText(content).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <Check /> : <Copy />}
        </IconAction>
        {onEdit && (
          <IconAction
            label={t("edit")}
            onClick={() => {
              setDraft(content);
              setEditing(true);
            }}
          >
            <Pencil />
          </IconAction>
        )}
      </div>
    </div>
  );
}

/**
 * One answer: what it looked up, the answer itself and, once it's done, what
 * you can do with it. While working with nothing written yet it shows the
 * run's phase — unless a step is already showing that it's busy.
 */
export function AssistantMessage({
  message,
  working = false,
  phase,
  elapsedSec,
  run,
  latest = false,
  onRegenerate,
}: {
  message: ChatMessage;
  working?: boolean;
  latest?: boolean;
  phase?: AiRunPhase;
  elapsedSec?: number;
  /** The run behind the newest answer, for its time and tokens. */
  run?: AiRunMeta | null;
  onRegenerate?: () => void;
}) {
  const t = useTranslations("Guidebooks.wikiChat");
  const [copied, setCopied] = useState(false);
  const steps = message.steps ?? [];
  const stepBusy = working && steps.some((step) => !step.done);

  return (
    <div className="group/answer">
      {steps.length > 0 && <ChatSteps steps={steps} working={working} />}
      {working && !message.content && !stepBusy && (
        <div className="flex items-center gap-2.5">
          <AiDots />
          <AiThinking
            phase={phase}
            label={phase === "finishing" ? undefined : t("steps.think.running")}
            elapsedSec={elapsedSec}
          />
        </div>
      )}
      {message.content && (
        <div className="text-[15px] leading-7">
          <AiMarkdown components={CHAT_MARKDOWN}>{message.content}</AiMarkdown>
        </div>
      )}
      {!working && message.content && (
        <div
          className={cn(
            "mt-1.5 flex flex-wrap items-center gap-0.5 transition-opacity",
            // Older answers keep their actions out of the way until pointed at.
            !latest &&
              "md:opacity-0 md:group-focus-within/answer:opacity-100 md:group-hover/answer:opacity-100",
          )}
        >
          <IconAction
            label={copied ? t("copied") : t("copy")}
            onClick={() => {
              void navigator.clipboard.writeText(plainAnswer(message.content)).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? <Check /> : <Copy />}
          </IconAction>
          {onRegenerate && (
            <IconAction label={t("regenerate")} onClick={onRegenerate}>
              <RotateCcw />
            </IconAction>
          )}
          {message.runId && <Feedback runId={message.runId as Id<"aiRuns">} />}
          {message.sources && message.sources.length > 0 && (
            <SourcesButton sources={message.sources} />
          )}
          {run && <AiRunStats run={run} className="ml-2" />}
        </div>
      )}
    </div>
  );
}
