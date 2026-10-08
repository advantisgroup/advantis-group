"use client";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import {
  CHECK_KPI_META,
  fmtDay,
  fmtDayShort,
  fmtKpi,
  RatingDot,
} from "@/components/performance/checks/checkUi";
import { PrintFrame } from "@/components/performance/checks/PrintFrame";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";

function delta(cur: number | null, ref: number | null): string {
  if (cur === null || ref === null) return "";
  const d = Math.round((cur - ref) * 10) / 10;
  if (d === 0) return " (±0)";
  return ` (${d > 0 ? "+" : "−"}${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(Math.abs(d))})`;
}

/** Print sheet of one check, with signature fields for an employee check. */
export default function CheckPrintPage() {
  const t = useTranslations("Performance.checks");
  const params = useParams<{ id: string }>();
  const data = useQuery(api.performance.checks.get, {
    checkId: params.id as Id<"performanceChecks">,
  });
  if (!data) return <PerformancePageSkeleton />;
  const { check, employee, actions } = data;
  const isEmployee = check.type === "employee";
  const rating = new Map(check.ratings.map((r) => [r.key, r]));
  const measure = new Map(actions.filter((a) => a.kpiKey).map((a) => [a.kpiKey!, a]));
  const agreements = actions.filter((a) => !a.kpiKey);
  const title = `${isEmployee ? t("typeEmployee") : t("typeKpi")} – ${employee.name}`;
  const k = check.kpis;
  const reasons = (list: { reason: string; count: number }[]) =>
    list.length ? list.map((r) => `${r.reason} (${r.count})`).join(", ") : t("noReasons");

  return (
    <PrintFrame title={title}>
      <div className="mb-4 flex items-end justify-between border-b border-black pb-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-neutral-500">
            Advantis · {data.dashboardName}
          </div>
          <h1 className="text-lg font-bold">{title}</h1>
        </div>
        <div className="text-right">
          <div>
            {t("date")}: <b>{fmtDay(check.date)}</b>
          </div>
          <div className="text-neutral-500">
            {t("asOf", { date: fmtDay(k.asOf) })} ·{" "}
            {t("week", { from: fmtDayShort(k.week.start), to: fmtDayShort(k.week.end) })}
          </div>
        </div>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-neutral-400 text-left">
            <th className="py-1 pr-2">{t("colKpi")}</th>
            <th className="py-1 pr-2 text-right">{t("colWeek")}</th>
            <th className="py-1 pr-2 text-right">{t("colMonth")}</th>
            <th className="py-1 pr-2 text-right">{t("colVm")}</th>
            <th className="py-1 pr-2 text-right">{t("colVj")}</th>
            <th className="py-1 pr-2 text-center">{t("colRating")}</th>
            <th className="py-1">
              {isEmployee ? t("colNote") : `${t("colNote")} / ${t("colMeasure")}`}
            </th>
          </tr>
        </thead>
        <tbody>
          {k.rows.map((row) => {
            const meta = CHECK_KPI_META[row.key];
            const isCheck = meta?.unit === "check";
            const r = rating.get(row.key);
            const m = measure.get(row.key);
            return (
              <tr
                key={row.key}
                className="break-inside-avoid border-b border-neutral-200 align-top"
              >
                <td className="py-1 pr-2 font-medium">
                  {t(`kpi.${row.key}`)}
                  {row.key === "unqualified" && (
                    <div className="font-normal text-neutral-500">
                      {t("reasonsMonth")}: {reasons(k.reasons.month)}
                    </div>
                  )}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {meta?.week ? fmtKpi(row.week, row.key) : ""}
                </td>
                <td className="py-1 pr-2 text-right font-semibold tabular-nums">
                  {isCheck ? "" : fmtKpi(row.month, row.key)}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {isCheck ? "" : `${fmtKpi(row.vm, row.key)}${delta(row.month, row.vm)}`}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {isCheck ? "" : `${fmtKpi(row.vj, row.key)}${delta(row.month, row.vj)}`}
                </td>
                <td className="py-1 pr-2 text-center">
                  <RatingDot rating={r?.rating} />
                </td>
                <td className="py-1">
                  {r?.note}
                  {m && (
                    <div>
                      → {m.text}
                      {m.dueDate ? ` (${t("due")} ${fmtDay(m.dueDate)})` : ""}
                      {m.done ? ` ✓` : ""}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {isEmployee && (
        <div className="mt-4 grid grid-cols-2 gap-6">
          {(["tops", "goFors"] as const).map((key) => (
            <div key={key}>
              <h2 className="mb-1 font-bold">{t(key)}</h2>
              <ol className="list-decimal space-y-0.5 pl-4">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="min-h-[1.4em] border-b border-dotted border-neutral-300">
                    {check[key][i] ?? ""}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {isEmployee && (
        <div className="mt-4">
          <h2 className="mb-1 font-bold">{t("agreements")}</h2>
          <table className="w-full border-collapse">
            <tbody>
              {(agreements.length ? agreements : [null, null, null]).map((a, i) => (
                <tr key={a?.id ?? i} className="border-b border-neutral-300">
                  <td className="w-5 py-1">{a?.done ? "☑" : "☐"}</td>
                  <td className="py-1">{a?.text ?? ""}</td>
                  <td className="w-28 py-1 text-right">
                    {a?.dueDate ? `${t("due")} ${fmtDay(a.dueDate)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {check.note && (
        <div className="mt-4">
          <h2 className="mb-1 font-bold">{t("note")}</h2>
          <p className="whitespace-pre-wrap">{check.note}</p>
        </div>
      )}

      {isEmployee && (
        <div className="mt-8 break-inside-avoid">
          <p className="mb-10">{t("signatureText")}</p>
          <div className="grid grid-cols-2 gap-10">
            {[t("signatureLead"), t("signatureEmployee")].map((label) => (
              <div key={label}>
                <div className="border-t border-black pt-1">
                  {t("place")} · {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-6 text-[9px] text-neutral-400">
        {t("by", { name: check.createdByName })}
      </div>
    </PrintFrame>
  );
}
