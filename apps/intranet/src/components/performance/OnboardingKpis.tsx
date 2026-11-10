"use client";

import { type api } from "@advantis/convex/api";
import { type FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import {
  DeltaBadge,
  type DeltaFormat,
  fmtDurationPrecise,
  fmtNum,
  fmtPct,
  fmtYm,
} from "@/components/performance/PerformanceFormat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

type Team = FunctionReturnType<typeof api.performance.onboardingKpis.team>;
export type OnboardingValues = Team["total"]["cur"];
export type OnboardingKey = keyof OnboardingValues;

/** The figures by group, in display order. */
export const ONBOARDING_GROUPS: { key: string; items: OnboardingKey[] }[] = [
  {
    key: "contacts",
    items: ["attempts", "reached", "notReached", "emails", "reachRate", "casesWorked"],
  },
  { key: "milestones", items: ["cards", "fuel", "twoMonth"] },
  { key: "closed", items: ["done", "winback", "refused", "unreachable", "fakeData", "tollOnly"] },
  {
    key: "calls",
    items: [
      "calls",
      "callsPerDay",
      "callsAnswered",
      "callsOutbound",
      "talkTotalSec",
      "talkAvgSec",
      "loginSec",
    ],
  },
];

/** Lower is better for these (shown red when rising). */
const LOWER_IS_BETTER = new Set<OnboardingKey>([
  "notReached",
  "winback",
  "refused",
  "unreachable",
  "fakeData",
]);

function formatOf(key: OnboardingKey): DeltaFormat {
  if (key === "reachRate") return "pts";
  if (key.endsWith("Sec")) return "duration";
  return "num";
}

export function fmtOnboarding(key: OnboardingKey, v: number | null | undefined): string {
  if (key === "reachRate") return fmtPct(v);
  if (key.endsWith("Sec")) return fmtDurationPrecise(v);
  return fmtNum(v);
}

function delta(cur: number | null, ref: number | null): number | null {
  if (cur === null || ref === null) return null;
  return Math.round((cur - ref) * 10) / 10;
}

/** A value's change against VM (and VJ), as small badges. */
export function OnboardingDelta({
  k,
  cur,
  vm,
  vj,
}: {
  k: OnboardingKey;
  cur: number | null;
  vm: number | null;
  vj?: number | null;
}) {
  const dVm = delta(cur, vm);
  const dVj = vj === undefined ? null : delta(cur, vj);
  if (dVm === null && dVj === null) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
      {dVm !== null && (
        <span className="inline-flex items-center gap-0.5">
          VM
          <DeltaBadge value={dVm} invert={LOWER_IS_BETTER.has(k)} format={formatOf(k)} />
          {dVm === 0 && "±0"}
        </span>
      )}
      {dVj !== null && (
        <span className="inline-flex items-center gap-0.5">
          VJ
          <DeltaBadge value={dVj} invert={LOWER_IS_BETTER.has(k)} format={formatOf(k)} />
          {dVj === 0 && "±0"}
        </span>
      )}
    </span>
  );
}

/** One figure as a tile with its explanation behind the "i". */
export function OnboardingTile({
  k,
  cur,
  vm,
  vj,
  highlight,
}: {
  k: OnboardingKey;
  cur: OnboardingValues;
  vm: OnboardingValues;
  vj: OnboardingValues;
  highlight?: boolean;
}) {
  const t = useTranslations("Performance.onboarding");
  return (
    <Card className={cn("relative", highlight && "border-t-2 border-t-primary")}>
      <InfoTip text={t(`info.${k}`)} className="absolute right-3 top-3" />
      <CardContent className="flex flex-col gap-1 p-4 pr-8">
        <span className="text-xs text-muted-foreground">{t(`kpi.${k}`)}</span>
        <span className="text-2xl font-semibold tabular-nums">{fmtOnboarding(k, cur[k])}</span>
        <OnboardingDelta k={k} cur={cur[k]} vm={vm[k]} vj={vj[k]} />
      </CardContent>
    </Card>
  );
}

/** All groups as tile sections (team overview top, an employee's page). */
export function OnboardingTiles({
  cur,
  vm,
  vj,
}: {
  cur: OnboardingValues;
  vm: OnboardingValues;
  vj: OnboardingValues;
}) {
  const t = useTranslations("Performance.onboarding");
  return (
    <div className="space-y-4">
      {ONBOARDING_GROUPS.map((g) => (
        <section key={g.key} className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t(`group.${g.key}`)}</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {g.items.map((k) => (
              <OnboardingTile key={k} k={k} cur={cur} vm={vm} vj={vj} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Per-person table: every figure with its change against VM. */
export function OnboardingTeamTable({ data }: { data: Team }) {
  const t = useTranslations("Performance.onboarding");
  const cell = (k: OnboardingKey, cur: OnboardingValues, vm: OnboardingValues) => (
    <td key={k} className="px-2 py-2 text-right align-top">
      <div className="tabular-nums">{fmtOnboarding(k, cur[k])}</div>
      <OnboardingDelta k={k} cur={cur[k]} vm={vm[k]} />
    </td>
  );
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("tableTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0 pb-2">
        <table className="w-full min-w-[1400px] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="sticky left-0 bg-card px-4" />
              {ONBOARDING_GROUPS.map((g) => (
                <th
                  key={g.key}
                  colSpan={g.items.length}
                  className="border-l px-2 pt-1 text-center font-medium"
                >
                  {t(`group.${g.key}`)}
                </th>
              ))}
            </tr>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="sticky left-0 bg-card px-4 py-2 text-left font-medium">
                {t("person")}
              </th>
              {ONBOARDING_GROUPS.flatMap((g) =>
                g.items.map((k, i) => (
                  <th
                    key={k}
                    title={t(`info.${k}`)}
                    className={cn(
                      "cursor-help px-2 py-2 text-right font-medium",
                      i === 0 && "border-l",
                    )}
                  >
                    {t(`short.${k}`)}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.employeeId} className="border-b">
                <td className="sticky left-0 bg-card px-4 py-2">
                  <Link
                    href={`/performance/mitarbeiter/${r.employeeId}/onboarding`}
                    className="font-medium hover:underline"
                  >
                    {r.name}
                  </Link>
                  {!r.linked && <div className="text-[11px] text-warn">{t("notLinked")}</div>}
                </td>
                {ONBOARDING_GROUPS.flatMap((g) => g.items.map((k) => cell(k, r.cur, r.vm)))}
              </tr>
            ))}
            <tr className="bg-muted/40 font-semibold">
              <td className="sticky left-0 bg-muted/40 px-4 py-2">{t("team")}</td>
              {ONBOARDING_GROUPS.flatMap((g) =>
                g.items.map((k) => cell(k, data.total.cur, data.total.vm)),
              )}
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

const TREND_KEYS: OnboardingKey[] = [
  "attempts",
  "reached",
  "reachRate",
  "cards",
  "fuel",
  "twoMonth",
  "done",
  "winback",
  "calls",
  "talkAvgSec",
];

/** The team's last months side by side. */
export function OnboardingTrend({ data }: { data: Team }) {
  const t = useTranslations("Performance.onboarding");
  const locale = useLocale();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("trendTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0 pb-2">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium" />
              {data.trend.map((m) => (
                <th key={m.ym} className="px-3 py-2 text-right font-medium">
                  {fmtYm(m.ym, locale)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TREND_KEYS.map((k) => (
              <tr key={k} className="border-b last:border-0">
                <td className="px-4 py-1.5 text-muted-foreground">{t(`kpi.${k}`)}</td>
                {data.trend.map((m) => (
                  <td key={m.ym} className="px-3 py-1.5 text-right tabular-nums">
                    {fmtOnboarding(k, m.values[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
