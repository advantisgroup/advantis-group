"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { Activity, LineChart as LineChartIcon, Table2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import { Link } from "@/components/Link";
import { useIsAdmin } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { Delta, Panel, Sparkline } from "./primitives";
import { RANGE_OPTIONS, STREAM_FAMILIES, type RangeOption } from "./streams";

const DAY_MS = 24 * 60 * 60 * 1000;

function percentDelta(total: number, previous: number): number | null {
  // No baseline means no percentage — a jump from 0 to 4 is not "+400%", and
  // rendering it that way is the classic way a dashboard invents a trend.
  if (previous === 0) return null;
  return ((total - previous) / previous) * 100;
}

/**
 * The page's one filter row plus the chart it scopes.
 *
 * Range lives here, above everything, rather than inside the chart card: the
 * stream tiles, the deltas and the plot all read the same slice, so the numbers
 * on screen always agree with each other.
 *
 * Series are drawn as lines with a faint area wash, never stacked. "Opened" and
 * "closed" are two independent measures of the same flow, not parts of a whole —
 * stacking them would draw a total that means nothing, and the crossover (are we
 * closing faster than they arrive?) is the entire point of putting them on one
 * plot.
 */
export function ThroughputPanel() {
  const t = useTranslations("Admin");
  const format = useFormatter();
  const isAdmin = useIsAdmin();
  const [range, setRange] = useState<RangeOption>(30);
  const [familyKey, setFamilyKey] = useState<string>("support");
  const [view, setView] = useState<"chart" | "table">("chart");

  const data = useQuery(api.org.overview.timelines, {
    days: range,
    tzOffsetMinutes: new Date().getTimezoneOffset(),
  });

  const families = STREAM_FAMILIES.filter((f) => !f.adminOnly || isAdmin);
  const family = families.find((f) => f.key === familyKey) ?? families[0];

  const byKey = useMemo(() => new Map((data?.series ?? []).map((s) => [s.key, s])), [data]);

  const config: ChartConfig = useMemo(() => {
    const out: ChartConfig = {};
    for (const s of family.series) {
      out[s.key] = {
        label: t(`overview.series.${s.key}`),
        color: `var(--chart-${s.slot})`,
      };
    }
    return out;
  }, [family, t]);

  const rows = useMemo(() => {
    if (!data) return [];
    return Array.from({ length: data.days }, (_, i) => {
      const at = data.windowStart + i * DAY_MS;
      const row: Record<string, number | string> = {
        at,
        label: format.dateTime(new Date(at), { month: "short", day: "numeric" }),
      };
      for (const s of family.series) row[s.key] = byKey.get(s.key)?.points[i] ?? 0;
      return row;
    });
  }, [data, family, byKey, format]);

  const rangeLabel = t("overview.rangeDays", { days: range });

  return (
    <section className="space-y-3">
      {/* Filter row — scopes every tile and the plot below it. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Activity className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">{t("overview.throughput")}</h2>
            <p className="text-xs text-muted-foreground">{t("overview.throughputHint")}</p>
          </div>
        </div>
        <div
          className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-panel-2 p-0.5"
          role="group"
          aria-label={t("overview.rangeLabel")}
        >
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={range === option}
              onClick={() => setRange(option)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                range === option
                  ? "bg-card text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("overview.rangeDays", { days: option })}
            </button>
          ))}
        </div>
      </div>

      {/* Stream tiles: one per family, each a single-series sparkline (so no
          legend — the tile's own label names what is plotted) that selects the
          family rendered in the plot below. */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        {families.map((f) => {
          const lead = byKey.get(f.leadKey);
          const leadDef = f.series.find((s) => s.key === f.leadKey);
          const selected = f.key === family.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={selected}
              onClick={() => setFamilyKey(f.key)}
              className={cn(
                "group rounded-xl border bg-card bg-gradient-to-b from-white/[0.025] to-transparent px-3.5 py-3 text-left transition-all",
                selected
                  ? "border-primary/40 ring-1 ring-inset ring-primary/20"
                  : "border-border/70 hover:border-border hover:-translate-y-0.5",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <f.icon className="size-3.5 shrink-0" />
                  <span className="truncate">{t(`overview.families.${f.labelKey}`)}</span>
                </span>
              </div>
              <div className="mt-2 flex items-end justify-between gap-2">
                <span className="text-2xl font-semibold leading-none tracking-tight">
                  {lead ? lead.total : <Skeleton className="inline-block h-6 w-8" />}
                </span>
                {lead && (
                  <Delta
                    value={percentDelta(lead.total, lead.previousTotal)}
                    goodWhen={leadDef?.goodWhen ?? "neutral"}
                  />
                )}
              </div>
              {lead && (
                <Sparkline
                  points={lead.points}
                  ariaLabel={t("overview.sparklineLabel", {
                    series: t(`overview.series.${f.leadKey}`),
                    days: range,
                  })}
                  // Selected draws in slot 1 — every family's lead series *is*
                  // its slot-1 series, so the tile's line and the same line in
                  // the plot below share a hue. (Brand red would read as an
                  // alarm on a neutral series; the border ring already carries
                  // the selection affordance.)
                  className={cn("mt-2 transition-colors", !selected && "text-muted-foreground/70")}
                  style={selected ? { color: "var(--chart-1)" } : undefined}
                />
              )}
            </button>
          );
        })}
      </div>

      <Panel
        icon={<family.icon />}
        title={t(`overview.families.${family.labelKey}`)}
        description={t("overview.familyHint", { range: rangeLabel })}
        bodyClassName="px-2 pb-2 pt-4 sm:px-4"
        action={
          <div className="flex items-center gap-1">
            <div
              className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-panel-2 p-0.5"
              role="group"
              aria-label={t("overview.viewLabel")}
            >
              {(
                [
                  ["chart", LineChartIcon, t("overview.viewChart")],
                  ["table", Table2, t("overview.viewTable")],
                ] as const
              ).map(([key, Icon, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={label}
                  aria-pressed={view === key}
                  onClick={() => setView(key)}
                  className={cn(
                    "grid size-6 place-items-center rounded-md transition-colors",
                    view === key
                      ? "bg-card text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href={family.href}>{t("overview.open")}</Link>
            </Button>
          </div>
        }
      >
        {data === undefined ? (
          <Skeleton className="mx-2 h-[240px] rounded-lg" />
        ) : view === "table" ? (
          <TableView rows={rows} family={family} />
        ) : (
          <ChartContainer config={config} className="h-[260px] w-full">
            <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <defs>
                {family.series.map((s) => (
                  <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`var(--color-${s.key})`} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={`var(--color-${s.key})`} stopOpacity={0.01} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                minTickGap={28}
                interval="preserveStartEnd"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={44}
                allowDecimals={false}
                tickMargin={4}
              />
              <ChartTooltip
                cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
                content={<ChartTooltipContent indicator="line" />}
              />
              {family.series.map((s) => (
                <Area
                  key={`area-${s.key}`}
                  dataKey={s.key}
                  type="monotone"
                  fill={`url(#fill-${s.key})`}
                  stroke="none"
                  // The line below carries identity; this is only the wash.
                  legendType="none"
                  tooltipType="none"
                  isAnimationActive={false}
                />
              ))}
              {family.series.map((s) => (
                <Line
                  key={`line-${s.key}`}
                  dataKey={s.key}
                  name={s.key}
                  type="monotone"
                  stroke={`var(--color-${s.key})`}
                  strokeWidth={2}
                  strokeLinecap="round"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--chart-panel)" }}
                  isAnimationActive={false}
                />
              ))}
              {family.series.length > 1 && (
                <ChartLegend content={<ChartLegendContent markShape="line" />} />
              )}
            </ComposedChart>
          </ChartContainer>
        )}
      </Panel>
    </section>
  );
}

/** The chart's table twin — every plotted value reachable without hovering.
 * Newest day first, because that is the one anybody checks. */
function TableView({
  rows,
  family,
}: {
  rows: Record<string, number | string>[];
  family: (typeof STREAM_FAMILIES)[number];
}) {
  const t = useTranslations("Admin");
  const ordered = [...rows].reverse();

  return (
    <div className="max-h-[260px] overflow-auto rounded-lg">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border/60 text-left text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">
              {t("overview.tableDay")}
            </th>
            {family.series.map((s) => (
              <th key={s.key} scope="col" className="px-3 py-2 text-right font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ background: `var(--chart-${s.slot})` }}
                  />
                  {t(`overview.series.${s.key}`)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map((row) => (
            <tr key={String(row.at)} className="border-b border-border/40 last:border-0">
              <th scope="row" className="px-3 py-1.5 text-left font-normal text-muted-foreground">
                {row.label}
              </th>
              {family.series.map((s) => (
                <td key={s.key} className="px-3 py-1.5 text-right tabular-nums">
                  {row[s.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
