"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import type { api } from "@advantis/convex/api";
import {
  DEFAULT_STATUS_CONFIG,
  followUpBucket,
  isClosedStatus,
  type OutcomeKind,
  pathLabel,
  quarterSlots,
  resolvePath,
  type StatusConfig,
} from "@advantis/convex/performance/onboarding";
import { type FunctionReturnType } from "convex/server";
import { Check, Copy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

/** The date a case is sorted by: close date, else the report's date. */
export const caseDate = (c: CaseRow) => c.closeDate ?? c.reportDate;

/** Follow-ups by date, then time (08:00 before 13:00, no time last). */
export function byFollowUp(
  a: { nextFollowUp: string | null; nextFollowUpTime: string | null },
  b: { nextFollowUp: string | null; nextFollowUpTime: string | null },
) {
  const key = (c: typeof a) => `${c.nextFollowUp ?? "9999-99-99"} ${c.nextFollowUpTime ?? "99:99"}`;
  return key(a).localeCompare(key(b));
}

/** Work groups of the call list: Neu + In Kontakt together first (the
 * time until "Karten bestellt" should be short), then Karten bestellt, then
 * Getankt (only the two-month check left), then closed. */
const workGroup = (status: string) =>
  status === "fresh" || status === "step1"
    ? 0
    : status === "step2"
      ? 1
      : status === "step3"
        ? 2
        : 3;

/**
 * Call list order (Vahan, 13.11.): due follow-ups first (by date and time),
 * then Neu + In Kontakt, Karten bestellt, Getankt – within a group prio
 * first, then the oldest case, then number.
 */
export function workOrder(today: string) {
  return (a: CaseRow, b: CaseRow) =>
    Number(followUpDue(b, today)) - Number(followUpDue(a, today)) ||
    (followUpDue(a, today) && followUpDue(b, today) ? byFollowUp(a, b) : 0) ||
    workGroup(a.status) - workGroup(b.status) ||
    Number(b.prio && isOpen(b)) - Number(a.prio && isOpen(a)) ||
    (caseDate(a) ?? "9999").localeCompare(caseDate(b) ?? "9999") ||
    a.customerNumber.localeCompare(b.customerNumber, "de", { numeric: true });
}

/** Phase and closed states in display order. */
export const STATUS_ORDER = [
  "fresh",
  "step1",
  "step2",
  "step3",
  "done",
  "winback",
  "refused",
  "fakeData",
  "unreachable",
  "tollOnly",
] as const;

/** The phase ladder (Neu → … → Abgeschlossen). */
export const LADDER = ["fresh", "step1", "step2", "step3", "done"] as const;

/** Closed lists in the archive besides "done" (feedback 03.11.). */
export const CLOSED_LISTS = ["winback", "refused", "fakeData", "unreachable", "tollOnly"] as const;
export type ClosedList = (typeof CLOSED_LISTS)[number];

/** Open case with an IT case not checked off yet. */
export const itOpen = (c: { status: string; itOpenSince: number | null }) =>
  !isClosedStatus(c.status) && c.itOpenSince !== null;

/** Customer mood 1–5 as emoji (annoyed → happy). */
export const MOOD_EMOJI: Record<number, string> = { 1: "😠", 2: "🙁", 3: "😐", 4: "🙂", 5: "😄" };

// ------------------------------------------------------- situation tree

const StatusConfigContext = createContext<StatusConfig>(DEFAULT_STATUS_CONFIG);

/** Provides the cockpit's situation tree ("Lage" with reasons). */
export function StatusConfigProvider({
  config,
  children,
}: {
  config: StatusConfig | undefined;
  children: ReactNode;
}) {
  return (
    <StatusConfigContext.Provider value={config ?? DEFAULT_STATUS_CONFIG}>
      {children}
    </StatusConfigContext.Provider>
  );
}

export function useStatusConfig(): StatusConfig {
  return useContext(StatusConfigContext);
}

/** "Neu" / "In Kontakt" / "Karten bestellt" / … */
export function useStatusName() {
  const t = useTranslations("OnboardingCockpit");
  return (status: string | null | undefined) => {
    if (!status) return "–";
    return (STATUS_ORDER as readonly string[]).includes(status)
      ? t(`status.${status as "fresh"}`)
      : status;
  };
}

/** The kind of a case's situation (its top-level entry), if any. */
export function outcomeKind(config: StatusConfig, c: CaseRow): OutcomeKind | null {
  const nodes = resolvePath(config, c.outcomePath);
  return nodes ? (nodes[0].kind ?? "other") : null;
}

/** "Case eröffnet › login problem › no welcome mail" for a case. */
export function useOutcomeLabel() {
  const config = useStatusConfig();
  return (c: { outcomePath: string[] }) => {
    if (c.outcomePath.length === 0) return null;
    return pathLabel(config, c.outcomePath) ?? c.outcomePath[c.outcomePath.length - 1];
  };
}

const STATUS_VARIANT: Record<
  string,
  "secondary" | "warning" | "success" | "destructive" | "muted"
> = {
  fresh: "secondary",
  step1: "warning",
  step2: "warning",
  step3: "muted",
  done: "success",
  winback: "destructive",
  refused: "destructive",
  fakeData: "muted",
  unreachable: "muted",
  tollOnly: "destructive",
};

export function StatusBadge({ status }: { status: string }) {
  const statusName = useStatusName();
  return (
    <Badge variant={STATUS_VARIANT[status] ?? "muted"} className="whitespace-nowrap">
      {statusName(status)}
    </Badge>
  );
}

/** Time of a follow-up, on the quarter hour (06:00–21:45). A time outside
 * the grid (older entries) stays selectable. */
export function TimeSelect({
  value,
  onChange,
  disabled,
  allowEmpty = true,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  allowEmpty?: boolean;
  className?: string;
}) {
  const t = useTranslations("OnboardingCockpit");
  const slots = quarterSlots();
  if (value && !slots.includes(value)) slots.unshift(value);
  return (
    <Select
      value={value || NO_TIME}
      onValueChange={(v) => onChange(v === NO_TIME ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn("w-[110px] tabular-nums", className)}
        aria-label={t("case.followUpTime")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {allowEmpty && <SelectItem value={NO_TIME}>{t("case.noTime")}</SelectItem>}
        {slots.map((slot) => (
          <SelectItem key={slot} value={slot} className="tabular-nums">
            {slot}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const NO_TIME = "__none";

// ---------------------------------------------------------------- copy

/** The customer number with a button that copies it (for Salesforce). */
export function CustomerNumber({ number, className }: { number: string; className?: string }) {
  const t = useTranslations("OnboardingCockpit");
  const [copied, setCopied] = useState(false);
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="tabular-nums">{number}</span>
      <button
        type="button"
        aria-label={t("copyNumber")}
        title={t("copyNumber")}
        className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          void navigator.clipboard.writeText(number).then(
            () => {
              setCopied(true);
              toast.success(t("copied", { number }));
              setTimeout(() => setCopied(false), 1500);
            },
            () => toast.error(t("copyFailed")),
          );
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
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
