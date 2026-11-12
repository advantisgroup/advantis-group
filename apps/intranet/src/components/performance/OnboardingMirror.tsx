"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";

import {
  OnboardingBasisToggle,
  useOnboardingBasis,
} from "@/components/performance/OnboardingBasis";
import { DeltaBadge, fmtNum, fmtYm } from "@/components/performance/PerformanceFormat";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceYm } from "@/components/performance/PerformanceYmContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

const BUCKETS = ["same", "prev", "older", "unknown"] as const;
const BUCKET_COLOR: Record<(typeof BUCKETS)[number], string> = {
  same: "bg-primary",
  prev: "bg-primary/45",
  older: "bg-muted-foreground/40",
  unknown: "bg-muted",
};
const STEPS = ["contact", "reached", "cards", "fuel", "twoMonth"] as const;

function Section({
  title,
  info,
  subtitle,
  children,
  className,
}: {
  title: string;
  info?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("relative", className)}>
      {info && <InfoTip text={info} className="absolute right-4 top-4" />}
      <CardHeader className="pb-2 pr-10">
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** One labelled horizontal bar. */
function BarRow({
  label,
  value,
  max,
  suffix,
  color = "bg-primary",
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  color?: string;
}) {
  const pct = max > 0 ? Math.max(value > 0 ? 1 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_5.5rem] items-center gap-3 py-1 text-sm">
      <span className="truncate text-muted-foreground">{label}</span>
      <div className="h-3.5 w-full rounded bg-muted/50">
        <div className={cn("h-full rounded", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-right tabular-nums">
        {fmtNum(value)}
        {suffix && <span className="ml-1 text-xs text-muted-foreground">{suffix}</span>}
      </span>
    </div>
  );
}

function fmtDays(v: number | null, t: (k: string, p?: Record<string, string>) => string): string {
  if (v === null) return "–";
  return t("days", { n: fmtNum(v) });
}

export function OnboardingMirror({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("Performance.onboarding.mirror");
  const tk = useTranslations("Performance.onboarding.kpi");
  const locale = useLocale();
  const [ym] = usePerformanceYm();
  const [basis] = useOnboardingBasis();
  const data = useQuery(api.performance.onboardingMirror.get, { companyId, ym, basis });

  if (!data) return <PerformanceContentSkeleton />;

  const month = fmtYm(data.ym, locale);
  const f = data.funnel;
  const pct = (v: number) => (f.total ? `${Math.round((v / f.total) * 100)} %` : "");
  const actionMax = Math.max(
    1,
    ...Object.values(data.actions).map((r) => r.same + r.prev + r.older + r.unknown),
  );
  const openMax = Math.max(
    1,
    data.open.notContacted,
    data.open.noCard,
    data.open.cardNoFuel,
    data.open.fuelNoCheck,
  );
  const reasons = data.reasons;
  const reasonMax = Math.max(1, ...Object.values(reasons));
  const tc = data.tempo.cur;
  const tv = data.tempo.vm;
  const bucketMax = Math.max(1, ...Object.values(tc.contactBuckets));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("subtitle", { month })}</p>
        <OnboardingBasisToggle />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section
          title={t("funnelTitle", { month })}
          subtitle={t("funnelSubtitle", { n: fmtNum(f.total) })}
          info={t("funnelInfo")}
        >
          <BarRow label={t("won")} value={f.total} max={f.total} color="bg-muted-foreground/40" />
          <BarRow
            label={t("contacted")}
            value={f.contacted}
            max={f.total}
            suffix={pct(f.contacted)}
            color="bg-primary/40"
          />
          <BarRow
            label={tk("reached")}
            value={f.reached}
            max={f.total}
            suffix={pct(f.reached)}
            color="bg-primary/60"
          />
          <BarRow
            label={tk("cards")}
            value={f.cards}
            max={f.total}
            suffix={pct(f.cards)}
            color="bg-primary"
          />
          <BarRow
            label={tk("fuel")}
            value={f.fuel}
            max={f.total}
            suffix={pct(f.fuel)}
            color="bg-ok"
          />
          <BarRow
            label={tk("twoMonth")}
            value={f.twoMonth}
            max={f.total}
            suffix={pct(f.twoMonth)}
            color="bg-ok"
          />
          <BarRow
            label={t("dropped")}
            value={f.dropped}
            max={f.total}
            suffix={pct(f.dropped)}
            color="bg-destructive"
          />
        </Section>

        <Section
          title={t("actionsTitle", { month })}
          subtitle={t("actionsSubtitle")}
          info={t("actionsInfo")}
        >
          {(["attempts", "reached", "cards", "fuel", "twoMonth", "closed"] as const).map((row) => {
            const r = data.actions[row];
            const total = r.same + r.prev + r.older + r.unknown;
            return (
              <div
                key={row}
                className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_5.5rem] items-center gap-3 py-1 text-sm"
              >
                <span className="truncate text-muted-foreground">{t(`action.${row}`)}</span>
                <div
                  className="flex h-3.5 overflow-hidden rounded bg-muted/50"
                  style={{ width: `${Math.max(total > 0 ? 2 : 0, (total / actionMax) * 100)}%` }}
                  title={BUCKETS.map((b) => `${t(`bucket.${b}`)}: ${r[b]}`).join(" · ")}
                >
                  {BUCKETS.map((b) =>
                    r[b] > 0 ? (
                      <div
                        key={b}
                        className={BUCKET_COLOR[b]}
                        style={{ width: `${(r[b] / total) * 100}%` }}
                      />
                    ) : null,
                  )}
                </div>
                <span className="text-right tabular-nums">
                  {fmtNum(total)}
                  {total > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {Math.round((r.same / total) * 100)} %
                    </span>
                  )}
                </span>
              </div>
            );
          })}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {BUCKETS.map((b) => (
              <span key={b} className="inline-flex items-center gap-1.5">
                <span className={cn("inline-block size-2.5 rounded-sm", BUCKET_COLOR[b])} />
                {t(`bucket.${b}`)}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("actionsShareHint")}</p>
        </Section>

        <Section
          title={t("openTitle")}
          subtitle={t(basis === "won" ? "openSubtitleWon" : "openSubtitleAll", {
            n: fmtNum(data.open.total),
            month,
          })}
          info={t("openInfo")}
        >
          <BarRow
            label={t("open.notContacted")}
            value={data.open.notContacted}
            max={openMax}
            color="bg-warn"
          />
          <BarRow
            label={t("open.noCard")}
            value={data.open.noCard}
            max={openMax}
            color="bg-primary/50"
          />
          <BarRow
            label={t("open.cardNoFuel")}
            value={data.open.cardNoFuel}
            max={openMax}
            color="bg-primary"
          />
          <BarRow
            label={t("open.fuelNoCheck")}
            value={data.open.fuelNoCheck}
            max={openMax}
            color="bg-ok"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {t("open.itOpen", { n: fmtNum(data.open.itOpen) })}
          </p>
        </Section>

        <Section
          title={t("reasonsTitle")}
          subtitle={t(basis === "won" ? "reasonsSubtitleWon" : "reasonsSubtitleAll", { month })}
          info={t("reasonsInfo")}
        >
          <BarRow label={tk("done")} value={reasons.done} max={reasonMax} color="bg-ok" />
          {(["winback", "refused", "unreachable", "fakeData", "tollOnly"] as const).map((k) => (
            <BarRow
              key={k}
              label={tk(k)}
              value={reasons[k]}
              max={reasonMax}
              color="bg-destructive/70"
            />
          ))}
        </Section>
      </div>

      <Section
        title={t("tempoTitle")}
        subtitle={t("tempoSubtitle", { month, n: fmtNum(tc.customers) })}
        info={t("tempoInfo")}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {STEPS.map((s) => {
            const cur = tc.steps[s].median;
            const prev = tv.steps[s].median;
            return (
              <div key={s} className="rounded-lg bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">{t(`step.${s}`)}</div>
                <div className="text-2xl font-semibold tabular-nums">{fmtDays(cur, t)}</div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {t("stepN", { n: fmtNum(tc.steps[s].n) })}
                  {cur !== null && prev !== null && (
                    <>
                      {" · VM"}
                      <DeltaBadge value={Math.round((cur - prev) * 10) / 10} invert />
                      {cur === prev && "±0"}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-1 text-sm font-medium">{t("contactSpeedTitle")}</div>
            {tc.within2Share !== null && (
              <p className="mb-2 text-sm text-ok">
                {t("within2", { pct: String(tc.within2Share) })}
              </p>
            )}
            {(["0", "1-2", "3-5", "6-10", "11+"] as const).map((b, i) => (
              <BarRow
                key={b}
                label={t(`speed.${b}`)}
                value={tc.contactBuckets[b]}
                max={bucketMax}
                color={i < 2 ? "bg-ok" : i < 3 ? "bg-ok/50" : "bg-warn"}
              />
            ))}
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">{t("trendTitle")}</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-1.5 text-left font-medium">{t("cohort")}</th>
                  {STEPS.map((s) => (
                    <th key={s} className="py-1.5 text-right font-medium">
                      {t(`stepShort.${s}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.tempo.trend.map((m) => (
                  <tr key={m.ym} className="border-b last:border-0">
                    <td className="py-1.5">{fmtYm(m.ym, locale)}</td>
                    {STEPS.map((s) => (
                      <td key={s} className="py-1.5 text-right tabular-nums">
                        {fmtDays(m[s].median, t)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {t("tempoNote", { since: data.cockpitSince?.split("-").reverse().join(".") ?? "–" })}
        </p>
      </Section>
    </div>
  );
}
