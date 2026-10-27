"use client";

import type { api } from "@advantis/convex/api";
import {
  followUpBucket,
  isClosedStatus,
  type OnboardingStatus,
} from "@advantis/convex/performance/onboarding";
import { type FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CaseRow = FunctionReturnType<typeof api.performance.onboarding.list>[number];

/** Today in Nürnberg as "YYYY-MM-DD". */
export function todayIso(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}

export const isOpen = (c: { status: string }) => !isClosedStatus(c.status);

export function followUpDue(c: CaseRow, today: string): boolean {
  if (!isOpen(c) || !c.nextFollowUp) return false;
  return c.nextFollowUp <= today;
}

/** Prio first, then due follow-ups, then the oldest report date, then name. */
export function workOrder(today: string) {
  return (a: CaseRow, b: CaseRow) =>
    Number(b.prio && isOpen(b)) - Number(a.prio && isOpen(a)) ||
    Number(followUpDue(b, today)) - Number(followUpDue(a, today)) ||
    (a.reportDate ?? "9999").localeCompare(b.reportDate ?? "9999") ||
    a.name.localeCompare(b.name, "de");
}

const STATUS_TONE: Record<string, "muted" | "secondary" | "warning" | "success"> = {
  fresh: "secondary",
  step1: "warning",
  step2: "warning",
  done: "success",
};

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("OnboardingCockpit");
  const known = status in STATUS_TONE;
  return (
    <Badge variant={STATUS_TONE[status] ?? "muted"} className="whitespace-nowrap">
      {known ? t(`status.${status as OnboardingStatus}`) : status}
    </Badge>
  );
}

/** A follow-up date, red when due, amber today. */
export function FollowUpDate({ date, open }: { date: string | null; open: boolean }) {
  const locale = useLocale();
  if (!date) return <span className="text-muted-foreground">–</span>;
  const bucket = open ? followUpBucket(date, todayIso()) : "later";
  return (
    <span
      className={cn(
        "whitespace-nowrap tabular-nums",
        bucket === "overdue" && "font-medium text-destructive",
        bucket === "today" && "font-medium text-warn",
      )}
    >
      {formatIsoDate(date, locale)}
    </span>
  );
}
