"use client";

import { useCallback, useEffect, useState } from "react";

import { berlinDate, berlinInstant, TIME_ZONE } from "@advantis/convex/time";
import { ConvexError } from "convex/values";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { reportClientError } from "@/lib/errors";

/**
 * Browser-side helpers for /zeiterfassung. Every date and time is shown in
 * Europe/Berlin, whatever the browser's own time zone, so what people see
 * matches what the server books and the 18:00 rule uses.
 */

/** Ticks every `ms` so running entries count up without re-querying. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** Today's Berlin date, re-read every minute so it rolls over at midnight. */
export function useBerlinToday(): string {
  return berlinDate(useNow(60_000));
}

export function formatClock(ms: number, locale: string): string {
  return new Date(ms).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

/** "7:30" (hours:minutes), signed with `signed`. */
export function formatMinutes(minutes: number, signed = false): string {
  const sign = minutes < 0 ? "−" : signed && minutes > 0 ? "+" : "";
  const abs = Math.abs(Math.round(minutes));
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

export function formatDays(days: number, locale: string): string {
  return days.toLocaleString(locale, { maximumFractionDigits: 2 });
}

export function formatDay(
  date: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = { weekday: "short", day: "2-digit", month: "2-digit" },
): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(locale, {
    ...options,
    timeZone: "UTC",
  });
}

export function formatMonth(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "HH:MM" of an instant on the Berlin clock, for a time input. */
export function toTimeInput(ms: number): string {
  return formatClock(ms, "de-DE");
}

/** A Berlin date plus an "HH:MM" from a time input, as an instant. */
export function fromTimeInput(date: string, time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  return berlinInstant(date, Number(match[1]) * 60 + Number(match[2]));
}

/** The Zeiterfassung-specific reason the server gave, if any. */
export function timeErrorReason(error: unknown): string | null {
  if (error instanceof ConvexError && error.data && typeof error.data === "object") {
    const reason = (error.data as { reason?: unknown }).reason;
    if (typeof reason === "string") return reason;
  }
  return null;
}

const KNOWN_REASONS = new Set([
  "month_locked",
  "overlap",
  "already_clocked_in",
  "not_clocked_in",
  "already_on_break",
  "not_on_break",
  "running_entry",
  "in_future",
  "invalid_range",
  "already_pending",
  "not_pending",
  "changed_meanwhile",
  "no_working_days",
]);

/** Toasts the precise reason for a refused change ("Monat gesperrt", …). */
export function useTimeErrorToast() {
  const t = useTranslations("Zeiterfassung");
  return useCallback(
    (error: unknown) => {
      reportClientError(error, "zeiterfassung");
      const reason = timeErrorReason(error);
      toast.error(
        reason && KNOWN_REASONS.has(reason) ? t(`errors.${reason}`) : t("errors.generic"),
      );
    },
    [t],
  );
}

export type AbsenceType = "vacation" | "sick" | "special" | "other";
export type AbsenceStatus = "pending" | "approved" | "rejected" | "cancelled";
export type ClockStatus = "working" | "break" | "out";
