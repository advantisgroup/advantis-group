import { formatDuration } from "./fmt";

import type { Lang } from "./locales/types";

/**
 * Renders a locale template (the same flat `{var}` strings `useI18n().t()`
 * interpolates) as React nodes, wrapping named values in a tone-coloured
 * `<span>` — the "Right now" card colours a whole headline by tone; pattern
 * report findings are one sentence with several independently-toned values
 * (a count in orange, a duration in green, …), so plain string interpolation
 * isn't enough here.
 */

export type HighlightTone = "ok" | "warn" | "info" | "muted" | "fg";
export type HighlightFormat = "duration" | "percent" | "count";

const TONE_CLASS: Record<HighlightTone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  info: "text-signal",
  muted: "text-muted-foreground",
  fg: "text-fg",
};

export interface HighlightValue {
  name: string;
  value: string | number;
  format?: HighlightFormat;
  tone?: HighlightTone;
}

function formatValue(v: HighlightValue, lang: Lang): string {
  if (v.format === "duration" && typeof v.value === "number") {
    return formatDuration(v.value, lang);
  }
  if (v.format === "percent") return `${v.value}%`;
  return String(v.value);
}

/** One template, filled and highlighted. Falls back to plain text for a
 * `{placeholder}` with no matching value, same as `useI18n().t()`. */
export function HighlightedSentence({
  template,
  values,
  lang,
  className,
}: {
  template: string;
  values: HighlightValue[];
  lang: Lang;
  className?: string;
}) {
  const byName = new Map(values.map(v => [v.name, v]));
  const parts = template.split(/(\{\w+\})/g);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        const match = /^\{(\w+)\}$/.exec(part);
        if (!match) return <span key={i}>{part}</span>;

        const v = byName.get(match[1]);
        if (!v) return <span key={i}>{part}</span>;

        return (
          <span
            key={i}
            className={
              v.tone ? `font-semibold ${TONE_CLASS[v.tone]}` : undefined
            }
          >
            {formatValue(v, lang)}
          </span>
        );
      })}
    </span>
  );
}
