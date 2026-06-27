"use client";

import { useMemo } from "react";

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
  node.childNodes.forEach(child => {
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

/** Renders sanitized rich-text HTML. Falls back to plain text for safety. */
export function RichText({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const clean = useMemo(() => sanitizeHtml(html), [html]);
  if (!clean) {
    return (
      <div className={cn("rich-text whitespace-pre-wrap", className)}>
        {htmlToText(html)}
      </div>
    );
  }
  return (
    <div
      className={cn("rich-text", className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
