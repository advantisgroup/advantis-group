"use client";

import { useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";

import { fmtDay } from "@/components/performance/checks/checkUi";
import { PrintFrame } from "@/components/performance/checks/PrintFrame";
import { ReviewCell } from "@/components/performance/checks/reviewUi";
import { fmtYm } from "@/components/performance/PerformanceFormat";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";

/** Print sheet of a month's business review (landscape table + notes). */
export default function ReviewPrintPage() {
  const t = useTranslations("Performance.checks");
  const locale = useLocale();
  const search = useSearchParams();
  const companyId = (search.get("companyId") ?? undefined) as Id<"companies"> | undefined;
  const data = useQuery(api.performance.reviews.get, {
    companyId,
    ym: search.get("ym") ?? undefined,
  });
  if (!data) return <PerformancePageSkeleton />;
  const title = t("reviewTitle", { month: fmtYm(data.ym, locale) });

  return (
    <PrintFrame title={title}>
      <style>{"@page { size: A4 landscape; margin: 10mm; }"}</style>
      <h1 className="mb-1 text-lg font-bold">{title}</h1>
      <p className="mb-3 text-neutral-500">
        {t("reviewIntro")} {!data.monthDone && `(${t("reviewRunning")})`}
      </p>
      <table className="w-full border-collapse text-[9px]">
        <thead>
          <tr className="border-b border-black">
            <th className="py-1 pr-1 text-left">{t("employees")}</th>
            {data.columns.map((c) => (
              <th key={c} className="px-1 py-1 text-right">
                {t(`col.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.employeeId} className="break-inside-avoid border-b border-neutral-200">
              <td className="py-1 pr-1 font-medium">{r.name}</td>
              {data.columns.map((c) => (
                <td key={c} className="px-1 py-1">
                  <ReviewCell col={c} cur={r.cur[c]} vm={r.vm[c]} vj={r.vj[c]} plain />
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-black">
            <td className="py-1 pr-1 font-bold">{t("team")}</td>
            {data.columns.map((c) => (
              <td key={c} className="px-1 py-1">
                <ReviewCell
                  col={c}
                  cur={data.total.cur[c]}
                  vm={data.total.vm[c]}
                  vj={data.total.vj[c]}
                  plain
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-[8px] text-neutral-500">Δ VM / Δ VJ</p>

      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <h2 className="mb-1 font-bold">{t("reviewChecks")}</h2>
          {data.checks.length === 0 && <p>{t("reviewNoChecks")}</p>}
          {data.checks.map((c) => (
            <div key={c.id} className="mb-1.5 break-inside-avoid">
              <b>
                {fmtDay(c.date)} · {c.employeeName}
              </b>{" "}
              ({c.type === "employee" ? t("typeEmployee") : t("typeKpi")})
              {c.tops.length > 0 && (
                <div>
                  {t("tops")}: {c.tops.join(" · ")}
                </div>
              )}
              {c.goFors.length > 0 && (
                <div>
                  {t("goFors")}: {c.goFors.join(" · ")}
                </div>
              )}
              {c.red.length > 0 && (
                <div>{t("redKpis", { list: c.red.map((k) => t(`kpi.${k}`)).join(", ") })}</div>
              )}
            </div>
          ))}
        </div>
        <div>
          <h2 className="mb-1 font-bold">{t("reviewActions")}</h2>
          {data.actions.map((a) => (
            <div key={a.id} className="break-inside-avoid">
              {a.done ? "☑" : "☐"} {a.text} — {a.employeeName ?? t("wholeTeam")}
              {a.dueDate ? ` (${t("due")} ${fmtDay(a.dueDate)})` : ""}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 break-inside-avoid">
        <h2 className="mb-1 font-bold">{t("reviewNotes")}</h2>
        <p className="min-h-[3em] whitespace-pre-wrap">{data.review.notes}</p>
        <h2 className="mb-1 mt-3 font-bold">{t("reviewMeasures")}</h2>
        {data.review.actions.map((a) => (
          <div key={a.id}>
            {a.done ? "☑" : "☐"} {a.text} — {a.employeeName ?? t("wholeTeam")}
            {a.dueDate ? ` (${t("due")} ${fmtDay(a.dueDate)})` : ""}
          </div>
        ))}
      </div>
    </PrintFrame>
  );
}
