"use client";

import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";

import { type TERMIN_ARTEN } from "@/components/applicants/applicant-types";
import { cn } from "@/lib/utils";

const ART_DOT: Record<(typeof TERMIN_ARTEN)[number], string> = {
  telefon: "bg-info",
  teams: "bg-primary",
  vor_ort: "bg-success",
};

const ART_TEXT: Record<(typeof TERMIN_ARTEN)[number], string> = {
  telefon: "border-l-info text-info",
  teams: "border-l-primary text-primary",
  vor_ort: "border-l-success text-success",
};

function parseDay(iso: string): Date | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** ISO 8601 week number. */
function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * The small calendar next to the Termin form: the chosen day's week with a
 * count per day, and that day's appointments in time order with the new one
 * dashed in between — so you see how full the day already is before booking.
 */
export function TerminDayPreview({
  datum,
  uhrzeit,
  art,
  newLabel,
  excludeTerminId,
  onPickDay,
}: {
  datum: string;
  uhrzeit: string;
  art: (typeof TERMIN_ARTEN)[number];
  /** What the dashed slot says — usually the applicant's name. */
  newLabel: string;
  /** The Termin being edited, so it isn't listed twice. */
  excludeTerminId?: Id<"applicantAppointments">;
  onPickDay: (iso: string) => void;
}) {
  const t = useTranslations("Applicants");
  const locale = useLocale();
  const selected = parseDay(datum);

  const week = useMemo(() => {
    if (!selected) return null;
    const monday = new Date(selected);
    monday.setDate(selected.getDate() - ((selected.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return {
        iso: toISO(d),
        label: d.toLocaleDateString(locale, { weekday: "short" }),
        day: d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" }),
        weekend: i >= 5,
      };
    });
    // `selected` is derived from `datum`; depend on the string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datum, locale]);

  const termine = useQuery(
    api.hr.applicants.listTermine,
    week ? { from: week[0].iso, to: week[6].iso } : "skip",
  );
  const others = (termine ?? []).filter((tm) => tm._id !== excludeTerminId);

  if (!week || !selected) return null;

  // Weekends only when they matter: picked, or something is booked there.
  const days = week.filter(
    (d) => !d.weekend || d.iso === datum || others.some((tm) => tm.datum === d.iso),
  );
  const dayItems = others.filter((tm) => tm.datum === datum);
  const slots = [
    ...dayItems.map((tm) => ({
      key: tm._id,
      time: tm.uhrzeit,
      name: tm.applicantName ?? "–",
      art: tm.art,
      isNew: false,
    })),
    { key: "new", time: uhrzeit, name: newLabel, art, isNew: true },
  ].sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  const clash = dayItems.some((tm) => tm.uhrzeit && tm.uhrzeit === uhrzeit);

  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("previewTitle")}
        </p>
        <span className="text-xs text-muted-foreground">
          {t("previewWeek", { n: isoWeek(selected) })}
        </span>
      </div>

      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {days.map((d) => {
          const items = others.filter((tm) => tm.datum === d.iso);
          const isSelected = d.iso === datum;
          return (
            <button
              key={d.iso}
              type="button"
              onClick={() => onPickDay(d.iso)}
              aria-pressed={isSelected}
              aria-label={`${d.label} ${d.day}: ${items.length}`}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-md border bg-card px-0.5 py-1.5 transition-colors hover:bg-accent/50",
                isSelected ? "border-2 border-primary text-primary" : "border-border/70",
              )}
            >
              <span className="text-[11px] font-semibold">{d.label}</span>
              <span className="text-[10px] text-muted-foreground">{d.day}</span>
              <span className="text-base font-bold leading-tight">{items.length}</span>
              <span className="flex min-h-1.5 flex-wrap justify-center gap-0.5">
                {items.slice(0, 6).map((tm) => (
                  <span key={tm._id} className={cn("size-1.5 rounded-full", ART_DOT[tm.art])} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold">
          {selected.toLocaleDateString(locale, {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
          })}{" "}
          · {t("previewDayCount", { count: dayItems.length })}
        </p>
        {termine === undefined ? (
          <div className="h-8 animate-pulse rounded-md bg-muted" />
        ) : (
          slots.map((s) => (
            <div
              key={s.key}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                s.isNew
                  ? "border border-dashed border-primary bg-primary/10 font-semibold text-primary"
                  : cn("border border-border/60 border-l-[3px] bg-card", ART_TEXT[s.art]),
              )}
            >
              <strong className="w-10 shrink-0 text-foreground">{s.time || "–"}</strong>
              <span className="min-w-0 flex-1 truncate text-foreground">{s.name}</span>
              <span className="shrink-0 rounded-full border px-1.5 text-[10px] font-semibold">
                {t(`terminArt.${s.art}`)}
              </span>
            </div>
          ))
        )}
        {clash && <p className="text-xs font-medium text-warning">{t("previewClash")}</p>}
      </div>
    </div>
  );
}
