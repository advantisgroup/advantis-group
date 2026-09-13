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
