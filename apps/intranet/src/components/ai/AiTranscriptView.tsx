"use client";

import { type ComponentType, type ReactNode, useState } from "react";

import { ChevronRight, FileText, Paperclip, ScrollText, Search, Wrench } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { AiGlyph } from "./AiGlyph";
import { AiMarkdown } from "./AiMarkdown";
import { AiVerbatim } from "./AiVerbatim";
import { type AiTranscript, type AiTranscriptPart, type AiTranscriptTurn } from "./transcript";

/** Context blocks the API wraps in a tag of their own (see apps/api's routes). */
const KNOWN_BLOCKS = new Set(["record", "wiki", "intranet"]);
const TAGGED = /^<([a-z][\w-]*)>\n?([\s\S]*?)\n?<\/\1>\s*/;
/** Past this, sent text reads as attached context rather than something typed. */
const LONG_TEXT = 400;

/** The wayfinder's search kinds (apps/api/src/routes/navigate.ts). */
const SEARCH_KINDS = new Set([
  "pages",
  "tickets",
  "wiki",
  "people",
  "announcements",
  "suggestions",
  "errorReports",
  "events",
]);

interface Block {
  tag: string | null;
  text: string;
}

/** Splits sent text into the context that rode along and what was actually
 * asked, so a question isn't lost at the bottom of eight thousand characters
 * of page list. Nothing is dropped — every block stays one click away. */
function splitSent(text: string): { blocks: Block[]; body: string } {
  const blocks: Block[] = [];
  let rest = text;
  for (let match = TAGGED.exec(rest); match; match = TAGGED.exec(rest)) {
    blocks.push({ tag: match[1], text: match[2] });
    rest = rest.slice(match[0].length);
  }
  rest = rest.trim();
  if (rest.length > LONG_TEXT || rest.startsWith("#")) {
    blocks.push({ tag: null, text: rest });
    rest = "";
  }
  return { blocks, body: rest };
}

function firstLine(text: string) {
  const line = text.split("\n").find((l) => l.trim()) ?? "";
  return line
    .replace(/^#+\s*/, "")
    .trim()
    .slice(0, 90);
}

function prettyJson(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

/** A collapsed line that opens onto what's behind it. */
export function AiDisclosure({
  icon: Icon,
  title,
  meta,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-accent/60"
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {meta && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{meta}</span>
        )}
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open && <div className="border-t border-border/60 px-3 py-2.5">{children}</div>}
    </div>
  );
}

/** Verbatim text inside a disclosure, which already draws the frame. */
export function AiDisclosureText({ children }: { children: string }) {
  return (
    <AiVerbatim className="max-h-96 rounded-none border-0 bg-transparent p-0">
      {children}
    </AiVerbatim>
  );
}

function FileChip({ name }: { name: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2.5 py-1.5 text-[12.5px]">
      <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{name}</span>
    </span>
  );
}

function ReplyText({ text }: { text: string }) {
  if (!text.trim()) return null;
  const json = prettyJson(text);
  if (json) return <AiVerbatim className="p-3 text-[12px]">{json}</AiVerbatim>;
  return (
    <div className="text-[14px] leading-relaxed">
      <AiMarkdown>{text}</AiMarkdown>
    </div>
  );
}

function ToolCall({
  part,
  result,
}: {
  part: Extract<AiTranscriptPart, { type: "toolCall" }>;
  result: string | undefined;
}) {
  const t = useTranslations("Ai");
  const input = (part.input ?? {}) as { kind?: unknown; query?: unknown };
  const isSearch =
    part.name === "search" && typeof input.kind === "string" && SEARCH_KINDS.has(input.kind);
  const query = typeof input.query === "string" ? input.query.trim() : "";
  const what = isSearch ? t(`history.searchKind.${input.kind as string}`) : "";
  const found = result === undefined ? null : result.split("\n").filter((l) => l.startsWith("- "));

  return (
    <AiDisclosure
      icon={isSearch ? Search : Wrench}
      title={
        isSearch
          ? query
            ? t("history.turn.search", { what, query })
            : t("history.turn.searchNewest", { what })
          : t("history.turn.tool", { name: part.name })
      }
      meta={found === null ? null : t("history.turn.found", { count: found.length })}
    >
      <div className="space-y-2.5">
        {!isSearch && (
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">
              {t("history.turn.input")}
            </p>
            <AiDisclosureText>{JSON.stringify(part.input, null, 2)}</AiDisclosureText>
          </div>
        )}
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            {t("history.turn.output")}
          </p>
          <AiDisclosureText>{result ?? t("history.turn.noResult")}</AiDisclosureText>
        </div>
      </div>
    </AiDisclosure>
  );
}

function Sent({ parts }: { parts: AiTranscriptPart[] }) {
  const t = useTranslations("Ai");
  const blocks: Block[] = [];
  const bodies: string[] = [];
  for (const part of parts) {
    if (part.type !== "text") continue;
    const split = splitSent(part.text);
    blocks.push(...split.blocks);
    if (split.body) bodies.push(split.body);
  }
  const files = parts.filter(
    (part): part is Extract<AiTranscriptPart, { type: "file" }> => part.type === "file",
  );

  return (
    <li className="flex flex-col items-end gap-2">
      <span className="text-[11px] text-muted-foreground">{t("history.turn.sent")}</span>
      {files.map((file, i) => (
        <FileChip key={i} name={file.name} />
      ))}
      {blocks.map((block, i) => (
        <div key={i} className="w-full max-w-xl">
          <AiDisclosure
            icon={FileText}
            title={
              block.tag && KNOWN_BLOCKS.has(block.tag)
                ? t(`history.block.${block.tag}`)
                : firstLine(block.text) || `<${block.tag}>`
            }
            meta={t("chars", { count: block.text.length })}
          >
            <AiDisclosureText>{block.text}</AiDisclosureText>
          </AiDisclosure>
        </div>
      ))}
      {bodies.length > 0 && (
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-2.5 text-[14px] leading-relaxed">
          {bodies.join("\n\n")}
        </p>
      )}
    </li>
  );
}

function ModelTurn({
  parts,
  results,
  footer,
  earlier = false,
}: {
  parts: AiTranscriptPart[];
  results: Map<string, string>;
  footer?: ReactNode;
  earlier?: boolean;
}) {
  const t = useTranslations("Ai");
  return (
    <li className="grid grid-cols-[1.125rem_minmax(0,1fr)] gap-x-3">
      <AiGlyph className={cn("mt-1 size-[18px]", earlier && "opacity-50 grayscale")} />
      <div className={cn("min-w-0 space-y-2.5", earlier && "text-muted-foreground")}>
        {earlier && <p className="text-[11px]">{t("history.turn.earlier")}</p>}
        {parts.map((part, i) =>
          part.type === "text" ? (
            <ReplyText key={i} text={part.text} />
          ) : part.type === "toolCall" ? (
            <ToolCall key={i} part={part} result={results.get(part.id)} />
          ) : part.type === "file" ? (
            <FileChip key={i} name={part.name} />
          ) : null,
        )}
        {footer}
      </div>
    </li>
  );
}

function Turn({ turn, results }: { turn: AiTranscriptTurn; results: Map<string, string> }) {
  const t = useTranslations("Ai");
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale);

  switch (turn.type) {
    case "instructions":
      return (
        <li>
          <AiDisclosure
            icon={ScrollText}
            title={t("history.turn.instructions")}
            meta={t("chars", { count: turn.text.length })}
          >
            <AiDisclosureText>{turn.text}</AiDisclosureText>
          </AiDisclosure>
        </li>
      );
    case "lookup":
      return (
        <li>
          <AiDisclosure
            icon={Search}
            title={t("history.turn.lookup", { what: turn.label, query: turn.query })}
            meta={t("history.turn.found", { count: turn.results.length })}
          >
            {turn.results.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                {t("history.turn.found", { count: 0 })}
              </p>
            ) : (
              <ul className="list-disc space-y-0.5 pl-4 text-[13px]">
                {turn.results.map((result, i) => (
                  <li key={i}>{result}</li>
                ))}
              </ul>
            )}
          </AiDisclosure>
        </li>
      );
    case "message":
      if (turn.parts.every((part) => part.type === "toolResult")) return null;
      return turn.role === "user" ? (
        <Sent parts={turn.parts} />
      ) : (
        <ModelTurn parts={turn.parts} results={results} earlier />
      );
    case "reply":
      return (
        <ModelTurn
          parts={turn.parts}
          results={results}
          footer={
            <p className="text-[11px] tabular-nums text-muted-foreground/70">
              {t("history.turn.tokens", {
                in: number.format(turn.tokensIn),
                out: number.format(turn.tokensOut),
              })}
              {turn.stopReason === "max_tokens" && ` · ${t("history.turn.cutOff")}`}
            </p>
          }
        />
      );
  }
}

/**
 * One run as the conversation it was: the instructions, what was sent (with
 * the context that went along folded into attachments), each search the model
 * made and what it got back, and its replies — in the order it happened.
 * `ending` closes it off: where it led, or why it stopped.
 */
export function AiTranscriptView({
  transcript,
  ending,
}: {
  transcript: AiTranscript;
  ending?: ReactNode;
}) {
  const t = useTranslations("Ai");
  // A tool's result arrives in the next message; it's shown with its call.
  const results = new Map<string, string>();
  for (const turn of transcript.turns) {
    if (turn.type !== "message") continue;
    for (const part of turn.parts) {
      if (part.type === "toolResult") results.set(part.toolCallId, part.text);
    }
  }

  return (
    <div className="space-y-5">
      {transcript.truncated && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[13px] text-warning">
          {t("history.truncated")}
        </p>
      )}
      <ol className="space-y-5">
        {transcript.turns.map((turn, i) => (
          <Turn key={i} turn={turn} results={results} />
        ))}
        {ending && <li>{ending}</li>}
      </ol>
    </div>
  );
}
