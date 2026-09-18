import type { api } from "@advantis/convex/api";
import type { FunctionReturnType } from "convex/server";

import { escapeHtml } from "@/lib/utils";

export type ApplicantDetail = NonNullable<FunctionReturnType<typeof api.hr.applicants.get>>;

export const KONTAKT_ARTEN = ["telefon", "email", "persoenlich", "video", "sonstiges"] as const;

export const EMAIL_KATEGORIEN = [
  "telefonisch_nicht_erreicht",
  "einladung",
  "absage",
  "sonstiges",
] as const;

export const TERMIN_ARTEN = ["telefon", "teams", "vor_ort"] as const;

export const TERMIN_TYPEN = [
  "interview",
  "gespraech",
  "probetag",
  "wiedervorlage",
  "sonstiges",
] as const;

/** The applicant's long-form CV fields — edited as rich text (paragraphs,
 * lists) rather than a flat string, both in the manual-entry/rescan form and
 * on the overview tab. Shared so every place that merges extracted data
 * knows which keys need `textToHtml`/`ensureRichHtml`. */
export const RICH_CV_FIELDS = ["ausbildung", "berufserfahrung", "zusammenfassung"] as const;

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Escapes text for safe embedding inside HTML markup. */
/**
 * Converts plain text (as produced by CV extraction or pasted from a PDF)
 * into paragraph HTML for the rich-text fields (summary, experience,
 * education) — a blank line starts a new `<p>`, a single line break becomes
 * `<br>`, so multi-line CV content keeps its structure instead of collapsing
 * onto one line the way a bare string does inside HTML.
 */
export function textToHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Feeds a value into a `RichTextEditor` field: HTML already in the string
 * (recognizable by a `<` tag) is passed through untouched; plain text —
 * either fresh from extraction or an older applicant record saved before
 * these fields supported formatting — is converted so it still renders with
 * its original line/paragraph structure.
 */
export function ensureRichHtml(value: string): string {
  return value.includes("<") ? value : textToHtml(value);
}
