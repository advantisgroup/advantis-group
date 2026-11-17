"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";

import { DeltaBadge, fmtNum, fmtYm } from "@/components/performance/PerformanceFormat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const fmtD = (d: number | null) =>
  d === null ? "–" : (Math.round(d * 10) / 10).toLocaleString("de-DE");

/**
 * "Cases" in the Kunden-Spiegel (17.11.): the cases the onboarding team
 * opened with UTA and confirmed closed in the cockpit – how many are open,
 * what came in and went out this month, how long they take per reason, who
 * holds open ones and which wait the longest.
 */
export function OnboardingCaseTracking({
  companyId,
  ym,
}: {
  companyId: Id<"companies">;
  ym: string;
}) {
  const t = useTranslations("Performance.onboarding.mirror.cases");
  const locale = useLocale();
  const data = useQuery(api.performance.onboardingMirror.cases, { companyId, ym });

  if (!data) return <Skeleton className="h-64 w-full" />;
  const month = fmtYm(data.ym, locale);
  const reasonMax = Math.max(1, ...data.reasons.map((r) => r.open + r.closed));
  const consultantMax = Math.max(1, ...data.consultants.map((c) => c.open));
  const avgDelta =
    data.cur.avgDays !== null && data.vm.avgDays !== null
      ? Math.round((data.cur.avgDays - data.vm.avgDays) * 10) / 10
      : null;

  const tiles = [
    {
      label: t("openNow"),
      value: fmtNum(data.openNow),
      hint: t("openNowHint", { it: fmtNum(data.itOpen), age: fmtD(data.openAvgAge) }),
      tone: data.openNow > 0 ? "text-warn" : "",
    },
    {
      label: t("opened", { month }),
      value: fmtNum(data.cur.opened),
      delta: data.cur.opened - data.vm.opened,
      invert: true,
    },
    {
      label: t("closed", { month }),
      value: fmtNum(data.cur.closed),
      delta: data.cur.closed - data.vm.closed,
    },
    {
      label: t("avgDays"),
      value: fmtD(data.cur.avgDays),
      suffix: data.cur.avgDays !== null ? t("daysShort") : undefined,
      delta: avgDelta,
      invert: true,
    },
  ];

  return (
    <Card className="relative">
      <InfoTip text={t("info")} className="absolute right-4 top-4" />
      <CardHeader className="pb-2 pr-10">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {t("subtitle", { total: fmtNum(data.total) })}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {data.total === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {tiles.map((tile) => (
                <div key={tile.label} className="rounded-lg bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">{tile.label}</div>
                  <div className={cn("text-2xl font-semibold tabular-nums", tile.tone)}>
                    {tile.value}
                    {tile.suffix && (
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        {tile.suffix}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {tile.hint}
                    {tile.delta !== undefined && tile.delta !== null && (
                      <>
                        {t("vm")}
                        <DeltaBadge value={tile.delta} invert={tile.invert} />
                        {tile.delta === 0 && "±0"}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center justify-between text-sm font-medium">
                  <span>{t("byReason")}</span>
                  <span className="flex items-center gap-3 text-[11px] font-normal text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-sm bg-warn" />
                      {t("legendOpen")}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-sm bg-primary/60" />
                      {t("legendClosed")}
                    </span>
                  </span>
                </div>
                {data.reasons.map((r) => {
                  const label = r.label.replace(/^Case eröffnet › /, "");
                  return (
                    <div
                      key={r.label}
                      className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_6.5rem] items-center gap-3 py-1 text-sm"
                    >
                      <span className="truncate text-muted-foreground" title={r.label}>
                        {label}
                      </span>
                      <div className="flex h-3.5 w-full overflow-hidden rounded bg-muted/50">
                        <div
                          className="h-full bg-warn"
                          style={{ width: `${(r.open / reasonMax) * 100}%` }}
                        />
                        <div
                          className="h-full bg-primary/60"
                          style={{ width: `${(r.closed / reasonMax) * 100}%` }}
                        />
                      </div>
                      <span className="text-right text-xs tabular-nums">
                        {fmtNum(r.open)} / {fmtNum(r.closed)}
                        <span className="ml-1 text-muted-foreground">
                          · Ø {fmtD(r.avgDays)} {t("daysShort")}
                        </span>
                      </span>
                    </div>
                  );
                })}

                {data.consultants.length > 0 && (
                  <>
                    <div className="mb-1 mt-5 text-sm font-medium">{t("byConsultant")}</div>
                    {data.consultants.map((c) => (
                      <div
                        key={c.name}
                        className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_6.5rem] items-center gap-3 py-1 text-sm"
                      >
                        <span className="truncate text-muted-foreground">{c.name}</span>
                        <div className="h-3.5 w-full rounded bg-muted/50">
                          <div
                            className="h-full rounded bg-warn/70"
                            style={{ width: `${(c.open / consultantMax) * 100}%` }}
                          />
                        </div>
                        <span className="text-right text-xs tabular-nums">
                          {fmtNum(c.open)}
                          <span className="ml-1 text-muted-foreground">
                            · Ø {fmtD(c.avgAge)} {t("daysShort")}
                          </span>
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">{t("longest")}</div>
                {data.longest.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noneOpen")}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="pb-1 font-medium">{t("customer")}</th>
                        <th className="pb-1 font-medium">{t("reason")}</th>
                        <th className="pb-1 text-right font-medium">{t("age")}</th>
                        <th className="pb-1 pl-3 font-medium">{t("assignee")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.longest.map((r, i) => (
                        <tr key={i} className="border-t border-border/60">
                          <td className="py-1.5 font-medium tabular-nums">{r.customerNumber}</td>
                          <td className="max-w-[12rem] truncate py-1.5 text-muted-foreground">
                            {r.label.replace(/^Case eröffnet › /, "")}
                          </td>
                          <td
                            className={cn(
                              "py-1.5 text-right tabular-nums",
                              r.days >= 14 ? "text-destructive" : r.days >= 7 ? "text-warn" : "",
                            )}
                          >
                            {r.days} {t("daysShort")}
                          </td>
                          <td className="py-1.5 pl-3 text-xs text-muted-foreground">
                            {r.assigneeName ?? "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
