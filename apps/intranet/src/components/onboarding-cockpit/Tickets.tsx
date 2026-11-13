"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Check, Clock, LifeBuoy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const days = (from: number, to: number) => Math.max(0, Math.round((to - from) / DAY_MS));

type OpenTicket = {
  _id: Id<"onboardingTickets">;
  label: string;
  openedAt: number;
  openedByName: string;
  checks: number;
};

/**
 * Before a new contact (13.11.): for every case opened with UTA and not
 * confirmed closed yet – "Ist der Case mittlerweile geschlossen?". The
 * contact form appears once each one is answered for this visit.
 */
export function TicketCheck({
  tickets,
  answered,
  onAnswered,
}: {
  tickets: OpenTicket[];
  answered: Set<string>;
  onAnswered: (id: string) => void;
}) {
  const t = useTranslations("OnboardingCockpit");
  const locale = useLocale();
  const handleError = useErrorHandler();
  const answer = useMutation(api.performance.onboarding.answerTicket);
  const [busy, setBusy] = useState<string | null>(null);
  const pending = tickets.filter((tk) => !answered.has(tk._id));
  if (pending.length === 0) return null;

  const respond = async (id: Id<"onboardingTickets">, closed: boolean) => {
    setBusy(id);
    try {
      await answer({ ticketId: id, closed });
      onAnswered(id);
    } catch (e) {
      handleError(e, t("case.saveError"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <LifeBuoy className="h-4 w-4 text-primary" />
        {t("tickets.checkTitle")}
      </h3>
      <p className="text-xs text-muted-foreground">{t("tickets.checkHint")}</p>
      <ul className="space-y-2">
        {pending.map((tk) => (
          <li
            key={tk._id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
          >
            <span className="mr-auto">
              <span className="font-medium">{tk.label}</span>
              <span className="block text-xs text-muted-foreground">
                {t("tickets.openedBy", {
                  date: formatDateTime(tk.openedAt, locale),
                  name: tk.openedByName,
                  days: days(tk.openedAt, Date.now()),
                })}
              </span>
            </span>
            <Button size="sm" disabled={busy === tk._id} onClick={() => void respond(tk._id, true)}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {t("tickets.closed")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy === tk._id}
              onClick={() => void respond(tk._id, false)}
            >
              <Clock className="mr-1.5 h-3.5 w-3.5" />
              {t("tickets.stillOpen")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Admin overview: every opened case, how long it was / is open, and the
 * average duration per reason. */
export function TicketOverview({ onOpen }: { onOpen: (id: Id<"onboardingCases">) => void }) {
  const t = useTranslations("OnboardingCockpit");
  const locale = useLocale();
  const rows = useQuery(api.performance.onboarding.ticketStats, {});
  const untracked = useQuery(api.performance.onboarding.untrackedCaseCount, {});
  const backfill = useMutation(api.performance.onboarding.backfillTickets);
  const handleError = useErrorHandler();
  const [backfilling, setBackfilling] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const now = Date.now();

  const byReason = useMemo(() => {
    const m = new Map<string, { label: string; open: number; closed: number; sum: number }>();
    for (const r of rows ?? []) {
      const e = m.get(r.label) ?? { label: r.label, open: 0, closed: 0, sum: 0 };
      if (r.closedAt === null) e.open++;
      else {
        e.closed++;
        e.sum += days(r.openedAt, r.closedAt);
      }
      m.set(r.label, e);
    }
    return [...m.values()].sort((a, b) => b.open + b.closed - (a.open + a.closed));
  }, [rows]);

  if (!rows) return <Skeleton className="h-40 w-full" />;
  const shown = onlyOpen ? rows.filter((r) => r.closedAt === null) : rows;
  const openCount = rows.filter((r) => r.closedAt === null).length;

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("tickets.intro")}</p>

      {!!untracked && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <span className="mr-auto">{t("tickets.backfillHint", { count: untracked })}</span>
          <Button
            size="sm"
            disabled={backfilling}
            onClick={() => {
              setBackfilling(true);
              void backfill({})
                .then(
                  (r) => toast.success(t("tickets.backfilled", { count: r.created })),
                  (e) => handleError(e, t("case.saveError")),
                )
                .finally(() => setBackfilling(false));
            }}
          >
            {t("tickets.backfill")}
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{t("tickets.reason")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("tickets.open")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("tickets.closedCount")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("tickets.avgDays")}</th>
            </tr>
          </thead>
          <tbody>
            {byReason.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  {t("tickets.empty")}
                </td>
              </tr>
            ) : (
              byReason.map((r) => (
                <tr key={r.label} className="border-t border-border/70">
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.open}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.closed}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.closed ? (r.sum / r.closed).toFixed(1) : "–"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={onlyOpen ? "default" : "outline"}
          onClick={() => setOnlyOpen(!onlyOpen)}
        >
          {t("tickets.onlyOpen")} {openCount}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{t("tickets.customer")}</th>
              <th className="px-3 py-2 font-medium">{t("tickets.reason")}</th>
              <th className="px-3 py-2 font-medium">{t("tickets.openedAt")}</th>
              <th className="px-3 py-2 font-medium">{t("tickets.closedAt")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("tickets.duration")}</th>
              <th className="px-3 py-2 font-medium">{t("tickets.assignee")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={r._id}
                className="cursor-pointer border-t border-border/70 hover:bg-muted/40"
                onClick={() => onOpen(r.caseId)}
              >
                <td className="px-3 py-2 font-medium tabular-nums">{r.customerNumber}</td>
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2 text-xs">{formatDateTime(r.openedAt, locale)}</td>
                <td className="px-3 py-2 text-xs">
                  {r.closedAt ? (
                    formatDateTime(r.closedAt, locale)
                  ) : (
                    <Badge variant="secondary">{t("tickets.stillOpenBadge")}</Badge>
                  )}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums",
                    r.closedAt === null && "text-warn",
                  )}
                >
                  {t("tickets.days", { days: days(r.openedAt, r.closedAt ?? now) })}
                </td>
                <td className="px-3 py-2 text-xs">{r.assigneeName ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
