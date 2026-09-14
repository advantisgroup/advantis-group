import { htmlToText } from "@/components/ui/rich-text";

// Drafts don't share a shape — each composer stores its own form — so these
// are the field names worth trying, in order.
const TITLE_FIELDS = ["thema", "title", "subject", "name", "titel"];
const BODY_FIELDS = ["erklaerung", "body", "description", "content", "text", "info"];

function firstText(source: Record<string, unknown>, fields: string[], max: number): string {
  const raw = fields
    .map((field) => source[field])
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (!raw) return "";
  const text = htmlToText(raw).trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/** Like `htmlToText`, but paragraphs stay on their own lines. */
function htmlToLines(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface DraftContent {
  title: string;
  body: string;
  /** The body as written, markup and all — for showing it rather than comparing it. */
  bodyRaw: string;
  /** Every other field, as comparable strings. */
  other: Record<string, string>;
}

/** A draft's whole text, uncut — for comparing versions of it. */
export function draftContent(data: string): DraftContent {
  const content: DraftContent = { title: "", body: "", bodyRaw: "", other: {} };
  let source: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== "object" || parsed === null) return content;
    source = parsed as Record<string, unknown>;
  } catch {
    return content;
  }
  const pick = (fields: string[]) =>
    fields.find((field) => typeof source[field] === "string" && String(source[field]).trim());
  const titleField = pick(TITLE_FIELDS);
  const bodyField = pick(BODY_FIELDS);
  if (titleField) content.title = htmlToLines(source[titleField] as string);
  if (bodyField) {
    content.bodyRaw = source[bodyField] as string;
    content.body = htmlToLines(content.bodyRaw);
  }
  for (const [key, value] of Object.entries(source)) {
    if (key === titleField || key === bodyField) continue;
    const blankText = typeof value === "string" && !value.trim();
    if (blankText && (TITLE_FIELDS.includes(key) || BODY_FIELDS.includes(key))) continue;
    content.other[key] = JSON.stringify(value) ?? "";
  }
  return content;
}

export function draftPreview(data: string): { title: string; snippet: string } {
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== "object" || parsed === null) return { title: "", snippet: "" };
    const source = parsed as Record<string, unknown>;
    return {
      title: firstText(source, TITLE_FIELDS, 90),
      snippet: firstText(source, BODY_FIELDS, 160),
    };
  } catch {
    return { title: "", snippet: "" };
  }
}
