"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import type { api } from "@advantis/convex/api";
import {
  DEFAULT_STATUS_CONFIG,
  findStage,
  followUpBucket,
  isClosedStatus,
  type OutcomeKind,
  pathLabel,
  resolvePath,
  type StatusConfig,
} from "@advantis/convex/performance/onboarding";
import { type FunctionReturnType } from "convex/server";
import { Check, Copy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

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

/** The date a case is sorted by: close date, else the report's date. */
export const caseDate = (c: CaseRow) => c.closeDate ?? c.reportDate;

/** Prio first, then due follow-ups, then the oldest case, then number. */
export function workOrder(today: string) {
  return (a: CaseRow, b: CaseRow) =>
    Number(b.prio && isOpen(b)) - Number(a.prio && isOpen(a)) ||
    Number(followUpDue(b, today)) - Number(followUpDue(a, today)) ||
    (caseDate(a) ?? "9999").localeCompare(caseDate(b) ?? "9999") ||
    a.customerNumber.localeCompare(b.customerNumber, "de", { numeric: true });
}

// ------------------------------------------------------------ status tree

const StatusConfigContext = createContext<StatusConfig>(DEFAULT_STATUS_CONFIG);

/** Provides the cockpit's status tree (stages, outcomes) to everything below. */
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

/** "Progress Step 1" / "Abgeschlossen" / "Winback". */
export function useStatusName() {
  const t = useTranslations("OnboardingCockpit");
  const config = useStatusConfig();
  return (status: string | null | undefined) => {
    if (!status) return "–";
    if (status === "done") return t("status.done");
    if (status === "winback") return t("status.winback");
    return findStage(config, status)?.label ?? status;
  };
}

/** The kind of a case's current outcome (its top-level entry), if any. */
export function outcomeKind(config: StatusConfig, c: CaseRow): OutcomeKind | null {
  if (c.outcomePath.length === 0) return null;
  const stage = c.status === "winback" ? null : c.status;
  const nodes = stage ? resolvePath(config, stage, c.outcomePath) : null;
  if (nodes) return nodes[0].kind ?? "other";
  // Winback cases keep the outcome of the stage they left: search all stages.
  for (const s of config.stages) {
    const found = resolvePath(config, s.id, c.outcomePath);
    if (found) return found[0].kind ?? "other";
  }
  return null;
}

/** "case opened › login problem › no welcome mail" for a case. */
export function useOutcomeLabel() {
  const config = useStatusConfig();
  return (c: { status: string; outcomePath: string[] }) => {
    if (c.outcomePath.length === 0) return null;
    if (resolvePath(config, c.status, c.outcomePath)) {
      return pathLabel(config, c.status, c.outcomePath);
    }
    for (const s of config.stages) {
      if (resolvePath(config, s.id, c.outcomePath)) return pathLabel(config, s.id, c.outcomePath);
    }
    return c.outcomePath.join(" › ");
  };
}

export function StatusBadge({ status }: { status: string }) {
  const statusName = useStatusName();
  const config = useStatusConfig();
  const index = config.stages.findIndex((s) => s.id === status);
  const variant =
    status === "done"
      ? "success"
      : status === "winback"
        ? "destructive"
        : index <= 0
          ? "secondary"
          : "warning";
  return (
    <Badge variant={variant} className="whitespace-nowrap">
      {statusName(status)}
    </Badge>
  );
}

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
