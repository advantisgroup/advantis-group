"use client";

import { useTranslations } from "next-intl";
import { type KeyboardEvent, type MouseEvent, useEffect, useMemo, useState } from "react";

import { RichDatePrompt } from "@/components/ui/rich-date-prompt";
import { useRichDateCalendar } from "@/hooks/use-rich-date-calendar";
import {
  ANNOUNCEMENT_RELEVANT_DATE_SOURCE,
  hasCalendarPayload,
  readRichDateElement,
  RICH_DATE_ATTRIBUTES,
  type RichDateValue,
} from "@/lib/rich-date";
import { headingAnchor, intranetLinkLabel } from "@/lib/intranet-links";
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

function cleanInto(node: Node, out: Node, doc: Document, headingIds: Set<string>) {
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
          const label = intranetLinkLabel(href);
          if (label) {
            safe.setAttribute("data-intranet-link-url", href);
            safe.setAttribute("title", href);
          }
        }
      }
      // @mention chip written by the rich-text editor — only this exact
      // attribute survives sanitization, and only as a plain numeric/opaque
      // id string (never arbitrary attributes/classes from pasted HTML).
      if (tag === "SPAN") {
        const mentionUserId = el.getAttribute("data-mention-user-id");
        const wikiFileName = el.getAttribute("data-wiki-file-name");
        if (mentionUserId) {
          safe.setAttribute("data-mention-user-id", mentionUserId);
          safe.setAttribute("class", "mention");
        } else if (wikiFileName) {
          safe.setAttribute("data-wiki-file-name", wikiFileName);
          safe.setAttribute("class", "wiki-file-chip");
          safe.setAttribute("role", "button");
          safe.setAttribute("tabindex", "0");
        } else {
          const dateStart = el.getAttribute("data-rich-date-start");
          if (!dateStart?.trim() || !Number.isFinite(Number(dateStart))) {
            cleanInto(el, safe, doc, headingIds);
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
      cleanInto(el, safe, doc, headingIds);
      if (tag === "H1" || tag === "H2" || tag === "H3") {
        const baseId = headingAnchor(safe.textContent ?? "");
        let id = baseId;
        let suffix = 2;
        while (headingIds.has(id)) id = `${baseId}-${suffix++}`;
        headingIds.add(id);
        safe.setAttribute("id", id);
        safe.setAttribute("data-hash-anchor", "");
      }
      if (tag === "A") {
        const label = intranetLinkLabel(safe.getAttribute("href") ?? "");
        if (label && safe.textContent?.trim() === safe.getAttribute("href")) {
          safe.textContent = label;
        }
      }
      out.appendChild(safe);
    } else {
      // Unknown tag: drop the wrapper but keep its (cleaned) children.
      cleanInto(el, out, doc, headingIds);
    }
  });
}

/** Allowlist-sanitize an HTML string. Client-only (uses DOMParser). */
export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined" || !html) return "";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const container = doc.createElement("div");
    cleanInto(doc.body, container, doc, new Set());
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
  autoSaveDates = true,
  sourcedDateSummary,
}: {
  html: string;
  className?: string;
  onMentionClick?: (userId: string, target: HTMLElement) => void;
  autoSaveDates?: boolean;
  sourcedDateSummary?: string;
}) {
  const t = useTranslations("RichText");
  const { addToCalendar, busy, isExternal } = useRichDateCalendar();
  const clean = useMemo(() => sanitizeHtml(html), [html]);
  const [datePrompt, setDatePrompt] = useState<{
    value: RichDateValue;
    summary: string;
  } | null>(null);

  useEffect(() => {
    if (!autoSaveDates || isExternal || !clean) return;
    const doc = new DOMParser().parseFromString(clean, "text/html");
    for (const element of doc.querySelectorAll<HTMLElement>("[data-rich-date-start]")) {
      if (element.getAttribute("data-rich-date-source") === ANNOUNCEMENT_RELEVANT_DATE_SOURCE) {
        continue;
      }
      const value = readRichDateElement(element);
      if (value && hasCalendarPayload(value)) {
        void addToCalendar(value, element.textContent ?? "", {
          automatic: true,
          silent: true,
        });
      }
    }
  }, [addToCalendar, autoSaveDates, clean, isExternal]);

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
      const summary =
        dateTarget.getAttribute("data-rich-date-source") === ANNOUNCEMENT_RELEVANT_DATE_SOURCE &&
        sourcedDateSummary?.trim()
          ? sourcedDateSummary
          : (dateTarget.textContent ?? "");
      if (hasCalendarPayload(value)) {
        void addToCalendar(value, summary);
      } else {
        setDatePrompt({ value, summary });
      }
    }
  }

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-rich-date-start]")) e.preventDefault();
    activate(target);
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
          if (target) {
            const value = readRichDateElement(target);
            target.title = t(
              isExternal
                ? "saveToIntranetCalendar"
                : value && hasCalendarPayload(value)
                  ? "inIntranetCalendar"
                  : "addToIntranetCalendar",
            );
          }
        }}
        dangerouslySetInnerHTML={{ __html: clean }}
      />
      {datePrompt && (
        <RichDatePrompt
          open
          onOpenChange={(open) => !open && setDatePrompt(null)}
          value={datePrompt.value}
          summary={datePrompt.summary}
          busy={busy}
          submitLabel={t(isExternal ? "saveToIntranetCalendar" : "addToIntranetCalendar")}
          onSubmit={addToCalendar}
        />
      )}
    </>
  );
}
