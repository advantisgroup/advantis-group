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

import { Delta, Panel } from "./primitives";
import { RANGE_OPTIONS, STREAM_FAMILIES, type RangeOption } from "./streams";

const DAY_MS = 24 * 60 * 60 * 1000;

function percentDelta(total: number, previous: number): number | null {
  // No baseline means no percentage — a jump from 0 to 4 is not "+400%", and
  // rendering it that way is the classic way a dashboard invents a trend.
  if (previous === 0) return null;
  return ((total - previous) / previous) * 100;
}

/**
 * One panel: the range in its header, a tab per family showing its total and
 * change, and the plot for whichever tab is picked. Tabs, deltas and plot all
 * read the same slice, so the numbers on screen always agree with each other.
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
    <Panel
      icon={<Activity />}
      title={t("overview.throughput")}
      description={t("overview.throughputHint")}
      bodyClassName="p-0"
      action={
        // scopes every tab total and the plot below, so the numbers always agree
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
      }
    >
      {/* One tab per family: its lead total and change, picking what the plot shows. */}
      <div
        role="group"
        aria-label={t("overview.throughput")}
        className="flex overflow-x-auto border-b border-border/60 px-2"
      >
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
                "relative shrink-0 px-3 pb-3 pt-3.5 text-left transition-colors",
                selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium">
                <f.icon className="size-3.5 shrink-0" />
                {t(`overview.families.${f.labelKey}`)}
              </span>
              <span className="mt-2 flex items-center gap-2">
                <span className="text-xl font-semibold leading-none tracking-tight text-foreground">
                  {lead ? lead.total : <Skeleton className="inline-block h-5 w-6" />}
                </span>
                {lead && (
                  <Delta
                    value={percentDelta(lead.total, lead.previousTotal)}
                    goodWhen={leadDef?.goodWhen ?? "neutral"}
                  />
                )}
              </span>
              {selected && (
                <span
                  aria-hidden
                  className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-foreground"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 px-5 pb-1 pt-4">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {t("overview.familyHint", { range: rangeLabel })}
        </p>
        <div className="flex shrink-0 items-center gap-1">
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
      </div>

      <div className="px-2 pb-2 pt-2 sm:px-4">
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
      </div>
    </Panel>
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
