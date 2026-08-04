"use client";

import { useTranslations } from "next-intl";
import { type KeyboardEvent, type MouseEvent, useMemo, useState } from "react";

import { RichDatePrompt } from "@/components/ui/rich-date-prompt";
import {
  downloadCalendarEvent,
  hasCalendarPayload,
  readRichDateElement,
  RICH_DATE_ATTRIBUTES,
  type RichDateValue,
} from "@/lib/rich-date";
import { cn } from "@/lib/utils";

const ALLOWED = new Set([
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "S",
  "STRIKE",
  "DEL",
  "P",
  "BR",
  "DIV",
  "SPAN",
  "UL",
  "OL",
  "LI",
  "BLOCKQUOTE",
  "A",
  "H1",
  "H2",
  "H3",
  "CODE",
  "PRE",
]);

const REMOVE = new Set([
  "SCRIPT",
  "STYLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "LINK",
  "META",
  "FORM",
  "INPUT",
  "BUTTON",
  "SVG",
]);

function cleanInto(node: Node, out: Node, doc: Document) {
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3 /* text */) {
      out.appendChild(doc.createTextNode(child.textContent ?? ""));
      return;
    }
    if (child.nodeType !== 1 /* element */) return;
    const el = child as Element;
    const tag = el.tagName;
    if (REMOVE.has(tag)) return;
    if (ALLOWED.has(tag)) {
      const safe = doc.createElement(tag);
      if (tag === "A") {
        const href = el.getAttribute("href") ?? "";
        if (href && !/^\s*javascript:/i.test(href)) {
          safe.setAttribute("href", href);
          safe.setAttribute("target", "_blank");
          safe.setAttribute("rel", "noreferrer noopener");
        }
      }
      // @mention chip written by the rich-text editor — only this exact
      // attribute survives sanitization, and only as a plain numeric/opaque
      // id string (never arbitrary attributes/classes from pasted HTML).
      if (tag === "SPAN") {
        const mentionUserId = el.getAttribute("data-mention-user-id");
        if (mentionUserId) {
          safe.setAttribute("data-mention-user-id", mentionUserId);
          safe.setAttribute("class", "mention");
        } else {
          const dateStart = el.getAttribute("data-rich-date-start");
          if (!dateStart?.trim() || !Number.isFinite(Number(dateStart))) {
            cleanInto(el, safe, doc);
            out.appendChild(safe);
            return;
          }
          for (const attribute of RICH_DATE_ATTRIBUTES) {
            const value = el.getAttribute(attribute);
            if (value !== null) safe.setAttribute(attribute, value);
          }
          safe.setAttribute("class", "rich-date");
          safe.setAttribute("role", "button");
          safe.setAttribute("tabindex", "0");
        }
      }
      cleanInto(el, safe, doc);
      out.appendChild(safe);
    } else {
      // Unknown tag: drop the wrapper but keep its (cleaned) children.
      cleanInto(el, out, doc);
    }
  });
}

/** Allowlist-sanitize an HTML string. Client-only (uses DOMParser). */
export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined" || !html) return "";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const container = doc.createElement("div");
    cleanInto(doc.body, container, doc);
    return container.innerHTML;
  } catch {
    return "";
  }
}

/** Plain-text extraction for previews/snippets. SSR-safe (regex based). */
export function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-3]|blockquote)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Renders sanitized rich-text HTML. Falls back to plain text for safety.
 *
 * `onMentionClick` is intentionally the only way this ui-layer component
 * knows about @mentions — it has no Convex/profile awareness of its own.
 * `dangerouslySetInnerHTML` content can't take a React onClick per node, so
 * clicks are caught via delegation on the wrapper and matched against
 * `[data-mention-user-id]`; the actual mention-click UI lives in
 * `components/profile/MentionRichText`, which wraps this component.
 */
export function RichText({
  html,
  className,
  onMentionClick,
}: {
  html: string;
  className?: string;
  onMentionClick?: (userId: string, target: HTMLElement) => void;
}) {
  const t = useTranslations("RichText");
  const clean = useMemo(() => sanitizeHtml(html), [html]);
  const [datePrompt, setDatePrompt] = useState<{
    value: RichDateValue;
    summary: string;
  } | null>(null);

  function activate(target: HTMLElement) {
    const mentionTarget = target.closest<HTMLElement>("[data-mention-user-id]");
    const userId = mentionTarget?.getAttribute("data-mention-user-id");
    if (mentionTarget && userId && onMentionClick) {
      onMentionClick(userId, mentionTarget);
      return;
    }
    const dateTarget = target.closest<HTMLElement>("[data-rich-date-start]");
    const value = dateTarget ? readRichDateElement(dateTarget) : null;
    if (dateTarget && value) {
      const summary = dateTarget.textContent ?? "";
      if (hasCalendarPayload(value)) {
        downloadCalendarEvent(value, summary);
      } else {
        setDatePrompt({ value, summary });
      }
    }
  }

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    activate(e.target as HTMLElement);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = e.target as HTMLElement;
    if (!target.matches("[data-mention-user-id], [data-rich-date-start]")) return;
    e.preventDefault();
    activate(target);
  }

  if (!clean) {
    return <div className={cn("rich-text whitespace-pre-wrap", className)}>{htmlToText(html)}</div>;
  }
  return (
    <>
      <div
        className={cn("rich-text", className)}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseOver={(event) => {
          const target = (event.target as HTMLElement).closest<HTMLElement>(
            "[data-rich-date-start]",
          );
          if (target) target.title = t("addToCalendar");
        }}
        dangerouslySetInnerHTML={{ __html: clean }}
      />
      {datePrompt && (
        <RichDatePrompt
          open
          onOpenChange={(open) => !open && setDatePrompt(null)}
          value={datePrompt.value}
          summary={datePrompt.summary}
        />
      )}
    </>
  );
}
