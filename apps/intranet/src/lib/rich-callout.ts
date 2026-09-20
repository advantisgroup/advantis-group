/**
 * Highlighted note/warning/danger blocks in rich text. The variant lives in a
 * `data-callout` attribute rather than a class so `sanitizeHtml` can validate
 * it against this list and let CSS do the rest — pasted HTML can never smuggle
 * a class through. Shared by the editor (which writes the attribute) and the
 * sanitizer (which is the only thing allowed to keep it), so the two can't
 * drift apart and silently start dropping blocks on the read page.
 */

export const CALLOUT_VARIANTS = ["info", "warning", "danger"] as const;

export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

export function isCalloutVariant(value: string | null): value is CalloutVariant {
  return !!value && (CALLOUT_VARIANTS as readonly string[]).includes(value);
}
