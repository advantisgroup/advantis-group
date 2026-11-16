"use client";

import { Fragment, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { ChevronDown, ChevronRight, Coins, Download, Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsAdmin } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadFile, toCsv } from "@/lib/export";

type Row = FunctionReturnType<typeof api.commissions.queries.month>["rows"][number];

function ymOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function lastMonths(n: number): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) =>
    ymOf(new Date(now.getFullYear(), now.getMonth() - i, 1)),
  );
}

/**
 * Provisionen: commission per sales employee for one month, from the
 * Performance reports and the sick notes. Admins only (pay data). Read only —
 * the figures follow whatever reports are uploaded.
 */
export default function CommissionsPage() {
  const t = useTranslations("Commissions");
  const locale = useLocale();
  const isAdmin = useIsAdmin();
  const months = useMemo(() => lastMonths(12), []);
  const [ym, setYm] = useState(months[0]);
  const [companyId, setCompanyId] = useState<Id<"companies"> | undefined>(undefined);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const data = useQuery(api.commissions.queries.month, isAdmin ? { ym, companyId } : "skip");

  const euro = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }),
    [locale],
  );
  const monthLabel = (m: string) =>
    new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    });

  const rows = data?.rows ?? [];
  const total = rows.reduce((s, r) => s + r.total, 0);

  const actions = useMemo(
    () => [
      {
        key: "csv",
        label: t("exportCsv"),
        icon: Download,
        onClick: () => {
          if (!data) return;
          const csv = toCsv(
            data.rows.map((r) => ({
              Mitarbeiter: r.name,
              "Closed Won": r.won,
              Hitrate: r.hitrate ?? "",
              Staffel: r.tierAmount,
              Wochenbonus: r.weeksBonus,
              Monatsbonus: r.monthBonus,
              "Hitrate-Bonus": r.hitrateBonus,
              "Gesund-Bonus": r.healthyBonus,
              Summe: r.total,
            })),
            [
              "Mitarbeiter",
              "Closed Won",
              "Hitrate",
              "Staffel",
              "Wochenbonus",
              "Monatsbonus",
              "Hitrate-Bonus",
              "Gesund-Bonus",
              "Summe",
            ],
          );
          downloadFile(`provisionen-${data.ym}.csv`, "text/csv;charset=utf-8", `﻿${csv}`);
        },
      },
    ],
    [data, t],
  );

  if (!isAdmin) return <ForbiddenScreen />;

  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8">
      <PageHeaderBar title={t("title")} description={t("description")} icon={<Coins />} />
      <PageHeaderActions actions={actions} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Select value={ym} onValueChange={setYm}>
          <SelectTrigger className="sm:w-56" aria-label={t("month")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                {monthLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data && data.dashboards.length > 1 && (
          <Select
            value={data.companyId ?? undefined}
            onValueChange={(v) => setCompanyId(v as Id<"companies">)}
          >
            <SelectTrigger className="sm:w-56" aria-label={t("dashboard")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.dashboards.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {data === undefined ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Coins />} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <>
          {data.running && (
            <div className="flex gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-warn" />
              <p>{t("running")}</p>
            </div>
          )}

          <KpiStrip>
            <Kpi label={t("kpiTotal")} value={euro.format(total)} featured />
            <Kpi
              label={t("kpiPaid")}
              value={`${rows.filter((r) => r.total > 0).length} / ${rows.length}`}
            />
            <Kpi
              label={t("kpiAsOf")}
              value={
                data.asOf
                  ? new Date(data.asOf).toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })
                  : "–"
              }
            />
          </KpiStrip>

          <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colEmployee")}</TableHead>
                  <TableHead className="text-right">{t("colWon")}</TableHead>
                  <TableHead className="text-right">{t("colHitrate")}</TableHead>
                  <TableHead className="text-right">{t("colTier")}</TableHead>
                  <TableHead className="text-right">{t("colWeeks")}</TableHead>
                  <TableHead className="text-right">{t("colMonth")}</TableHead>
                  <TableHead className="text-right">{t("colHitrateBonus")}</TableHead>
                  <TableHead className="text-right">{t("colHealthy")}</TableHead>
                  <TableHead className="text-right">{t("colTotal")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const isOpen = open.has(r.employeeId);
                  return (
                    <Fragment key={r.employeeId}>
                      <TableRow className="cursor-pointer" onClick={() => toggle(r.employeeId)}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-1.5">
                            {isOpen ? (
                              <ChevronDown className="size-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-4 text-muted-foreground" />
                            )}
                            {r.name}
                            {!r.linked && <Badge variant="warning">{t("notLinked")}</Badge>}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.won}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.hitrate === null ? "–" : `${r.hitrate.toLocaleString(locale)} %`}
                        </TableCell>
                        <Money value={r.tierAmount} euro={euro} />
                        <Money value={r.weeksBonus} euro={euro} />
                        <Money value={r.monthBonus} euro={euro} />
                        <Money value={r.hitrateBonus} euro={euro} />
                        <Money value={r.healthyBonus} euro={euro} />
                        <TableCell className="text-right font-semibold tabular-nums">
                          {euro.format(r.total)}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="bg-panel-2/50 hover:bg-panel-2/50">
                          <TableCell colSpan={9}>
                            <Details row={r} euro={euro} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={8} className="font-medium">
                    {t("sum")}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {euro.format(total)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </>
      )}

      <Rules />
    </div>
  );
}

function Money({ value, euro }: { value: number; euro: Intl.NumberFormat }) {
  return (
    <TableCell className={`text-right tabular-nums ${value === 0 ? "text-muted-foreground" : ""}`}>
      {value === 0 ? "–" : euro.format(value)}
    </TableCell>
  );
}

function Details({ row, euro }: { row: Row; euro: Intl.NumberFormat }) {
  const t = useTranslations("Commissions");
  return (
    <div className="grid gap-4 py-1 text-sm sm:grid-cols-3">
      <div>
        <p className="mb-1 font-medium">{t("detailTier")}</p>
        {row.tiers.length === 0 ? (
          <p className="text-muted-foreground">{t("detailTierNone", { won: row.won })}</p>
        ) : (
          <ul className="space-y-0.5 text-muted-foreground">
            {row.tiers.map((l) => (
              <li key={l.from}>
                {t("detailTierLine", {
                  from: l.from,
                  to: l.to === null ? "…" : String(l.to),
                  deals: l.deals,
                  per: euro.format(l.perDeal),
                  amount: euro.format(l.amount),
                })}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-1 font-medium">{t("detailWeeks")}</p>
        <ul className="space-y-0.5 text-muted-foreground">
          {row.weeks.map((w) => (
            <li key={w.kw} className={w.bonus > 0 ? "font-medium text-foreground" : ""}>
              {t("detailWeekLine", { kw: w.kw, won: w.won })}
              {w.bonus > 0 && ` → ${euro.format(w.bonus)}`}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1 font-medium">{t("detailHealthy")}</p>
        {row.healthyStreak === null ? (
          <p className="text-muted-foreground">{t("detailHealthyUnknown")}</p>
        ) : (
          <p className="text-muted-foreground">
            {t("detailHealthyStreak", { months: row.healthyStreak, every: row.healthyMonths })}
          </p>
        )}
        {row.sickDays.length > 0 && (
          <p className="mt-1 text-muted-foreground">
            {t("detailSick", { days: row.sickDays.join(", ") })}
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {t("detailReportName", { name: row.reportName })}
        </p>
      </div>
    </div>
  );
}

function Rules() {
  const t = useTranslations("Commissions");
  return (
    <div className="rounded-xl border border-border/70 bg-card px-4 py-3 text-sm">
      <p className="mb-1 font-medium">{t("rulesTitle")}</p>
      <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
        <li>{t("ruleTier")}</li>
        <li>{t("ruleWeek")}</li>
        <li>{t("ruleMonth")}</li>
        <li>{t("ruleHitrate")}</li>
        <li>{t("ruleHealthy")}</li>
      </ul>
    </div>
  );
}
