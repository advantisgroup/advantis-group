"use client";

import { type MouseEvent, useMemo } from "react";

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
  const clean = useMemo(() => sanitizeHtml(html), [html]);

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    if (!onMentionClick) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-mention-user-id]");
    const userId = target?.getAttribute("data-mention-user-id");
    if (target && userId) onMentionClick(userId, target);
  }

  if (!clean) {
    return <div className={cn("rich-text whitespace-pre-wrap", className)}>{htmlToText(html)}</div>;
  }
  return (
    <div
      className={cn("rich-text", className)}
      onClick={onMentionClick ? handleClick : undefined}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
