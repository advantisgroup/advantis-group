"use client";

import { Fragment, type ReactNode, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { ChevronDown, ChevronRight, Coins, Download, Info, RotateCcw, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsAdmin } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import { Label } from "@/components/ui/label";
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
import { useErrorHandler } from "@/hooks/use-error-handler";
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
              Angepasst: [r.wonOverridden && "Closed Won", r.hitrateOverridden && "Hitrate"]
                .filter(Boolean)
                .join(", "),
              Notiz: r.note ?? "",
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
              "Angepasst",
              "Notiz",
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
                        <TableCell className="text-right tabular-nums">
                          <Overridden
                            on={r.wonOverridden}
                            title={t("autoValue", { value: r.autoWon })}
                          >
                            {r.won}
                          </Overridden>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Overridden
                            on={r.hitrateOverridden}
                            title={t("autoValue", {
                              value:
                                r.autoHitrate === null
                                  ? "–"
                                  : `${r.autoHitrate.toLocaleString(locale)} %`,
                            })}
                          >
                            {r.hitrate === null ? "–" : `${r.hitrate.toLocaleString(locale)} %`}
                          </Overridden>
                        </TableCell>
                        <Money value={r.tierAmount} euro={euro} />
                        <Money value={r.weeksBonus} euro={euro} />
                        <Money value={r.monthBonus} euro={euro} />
                        <Money value={r.hitrateBonus} euro={euro} />
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <HealthyToggle
                            row={r}
                            ym={data.ym}
                            companyId={data.companyId}
                            euro={euro}
                          />
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {euro.format(r.total)}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="bg-panel-2/50 hover:bg-panel-2/50">
                          <TableCell colSpan={9}>
                            <Details row={r} euro={euro} />
                            {data.companyId && (
                              <AdjustForm
                                key={`${r.employeeId}:${data.ym}:${r.won}:${r.hitrate}:${r.note}`}
                                row={r}
                                ym={data.ym}
                                companyId={data.companyId}
                              />
                            )}
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

function Overridden({ on, title, children }: { on: boolean; title: string; children: ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    <span className="inline-flex items-center gap-1 font-medium text-warn" title={title}>
      <span className="size-1.5 rounded-full bg-warn" aria-hidden />
      {children}
    </span>
  );
}

function HealthyToggle({
  row,
  ym,
  companyId,
  euro,
}: {
  row: Row;
  ym: string;
  companyId: Id<"companies"> | null;
  euro: Intl.NumberFormat;
}) {
  const t = useTranslations("Commissions");
  const handleError = useErrorHandler();
  const set = useMutation(api.commissions.adjustments.set);
  if (!companyId) return null;
  return (
    <label className="inline-flex cursor-pointer items-center justify-end gap-2">
      {row.healthyPaid ? (
        <span className="tabular-nums">{euro.format(row.healthyBonus)}</span>
      ) : row.healthyDue ? (
        <Badge variant="success">{t("healthyDue")}</Badge>
      ) : (
        <span className="text-muted-foreground">–</span>
      )}
      <Checkbox
        checked={row.healthyPaid}
        aria-label={t("healthyPay", { name: row.name })}
        onCheckedChange={(checked) =>
          set({ companyId, ym, employeeId: row.employeeId, healthyPaid: checked === true })
            .then(() =>
              toast.success(checked === true ? t("healthyPaidToast") : t("healthyUnpaidToast")),
            )
            .catch(handleError)
        }
      />
    </label>
  );
}

function AdjustForm({ row, ym, companyId }: { row: Row; ym: string; companyId: Id<"companies"> }) {
  const t = useTranslations("Commissions");
  const locale = useLocale();
  const handleError = useErrorHandler();
  const set = useMutation(api.commissions.adjustments.set);
  const [won, setWon] = useState(row.wonOverridden ? String(row.won) : "");
  const [hitrate, setHitrate] = useState(
    row.hitrateOverridden && row.hitrate !== null ? String(row.hitrate).replace(".", ",") : "",
  );
  const [note, setNote] = useState(row.note ?? "");
  const [busy, setBusy] = useState(false);

  const parse = (value: string): number | null => {
    const trimmed = value.trim().replace(",", ".");
    return trimmed === "" ? null : Number(trimmed);
  };

  async function save(reset = false) {
    const wonValue = reset ? null : parse(won);
    const hitrateValue = reset ? null : parse(hitrate);
    if (
      (wonValue !== null && Number.isNaN(wonValue)) ||
      (hitrateValue !== null && Number.isNaN(hitrateValue))
    ) {
      toast.error(t("invalidNumber"));
      return;
    }
    setBusy(true);
    await set({
      companyId,
      ym,
      employeeId: row.employeeId,
      wonOverride: wonValue,
      hitrateOverride: hitrateValue,
      note: reset ? null : note,
    })
      .then(() => toast.success(reset ? t("resetToast") : t("savedToast")))
      .catch(handleError)
      .finally(() => setBusy(false));
  }

  const autoHitrate =
    row.autoHitrate === null ? "–" : `${row.autoHitrate.toLocaleString(locale)} %`;
  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <p className="mb-2 text-sm font-medium">{t("adjustTitle")}</p>
      <div className="grid gap-3 sm:grid-cols-[10rem_10rem_1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor={`won-${row.employeeId}`}>{t("adjustWon")}</Label>
          <Input
            id={`won-${row.employeeId}`}
            inputMode="numeric"
            value={won}
            onChange={(e) => setWon(e.target.value)}
            placeholder={t("autoPlaceholder", { value: row.autoWon })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`hit-${row.employeeId}`}>{t("adjustHitrate")}</Label>
          <Input
            id={`hit-${row.employeeId}`}
            inputMode="decimal"
            value={hitrate}
            onChange={(e) => setHitrate(e.target.value)}
            placeholder={t("autoPlaceholder", { value: autoHitrate })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`note-${row.employeeId}`}>{t("adjustNote")}</Label>
          <Input
            id={`note-${row.employeeId}`}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("adjustNotePlaceholder")}
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            <Save />
            {t("save")}
          </Button>
          {(row.wonOverridden || row.hitrateOverridden || row.note) && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void save(true)}>
              <RotateCcw />
              {t("reset")}
            </Button>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{t("adjustHint")}</p>
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
        <li>{t("ruleAdjust")}</li>
      </ul>
    </div>
  );
}
