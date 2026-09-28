"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { ArrowLeft, BarChart3, LineChart as LineChartIcon, Lock, Table2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import { Delta, Panel } from "@/components/admin/overview/primitives";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { Link } from "@/components/Link";
import { useHasCapability } from "@/components/providers/current-user";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Stats = FunctionReturnType<typeof api.marketing.stats.overview>;

const RANGES = [30, 90, 365] as const;
const HOUR = 60 * 60 * 1000;

// received and closed are two measures of one flow, drawn as lines on one axis: never stacked
const SERIES = [
  { key: "received", slot: 1 },
  { key: "closed", slot: 2 },
] as const;

/** Change in percent, or null without a baseline — 0 → 4 is not "+400%". */
const percentDelta = (now: number | undefined, before: number | undefined) =>
  now === undefined || before === undefined || before === 0
    ? null
    : ((now - before) / before) * 100;

/**
 * How the website inbox is doing: what came in and got closed, how fast the
 * first answer goes out, how long things stay open, and where they come from.
 */
export default function InquiryStatsPage() {
  const t = useTranslations("Inquiries.stats");
  const ti = useTranslations("Inquiries");
  const canManage = useHasCapability("manage_inquiries");
  const [days, setDays] = useState<(typeof RANGES)[number]>(90);
  // rounded to the hour, so the query's arguments (and its read range) hold still
  const [until] = useState(() => Math.floor(Date.now() / HOUR) * HOUR);
  const stats = useQuery(
    api.marketing.stats.overview,
    canManage ? { days, until, tzOffsetMinutes: new Date().getTimezoneOffset() } : "skip",
  );
  const duration = useDuration();

  if (!canManage) return <EmptyState icon={<Lock />} title={ti("noAccess")} />;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeaderBar title={t("title")} description={t("description")} icon={<BarChart3 />} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/inquiries"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {ti("back")}
        </Link>
        <div
          className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-panel-2 p-0.5"
          role="group"
          aria-label={t("range")}
        >
          {RANGES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={days === option}
              onClick={() => setDays(option)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                days === option
                  ? "bg-card text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("days", { days: option })}
            </button>
          ))}
        </div>
      </div>

      {stats === undefined ? (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <KpiStrip className="mt-6">
            <Kpi
              label={t("received")}
              value={stats.totals.received}
              hint={t("before", { value: stats.totals.receivedBefore })}
              trailing={
                <Delta
                  value={percentDelta(stats.totals.received, stats.totals.receivedBefore)}
                  goodWhen="neutral"
                />
              }
            />
            <Kpi
              label={t("firstResponse")}
              value={duration(stats.totals.medianFirstResponseMs)}
              hint={t("firstResponseHint", {
                before: duration(stats.totals.medianFirstResponseBeforeMs),
              })}
              trailing={
                <Delta
                  value={percentDelta(
                    stats.totals.medianFirstResponseMs,
                    stats.totals.medianFirstResponseBeforeMs,
                  )}
                  goodWhen="down"
                />
              }
            />
            <Kpi
              label={t("timeToClose")}
              value={duration(stats.totals.medianTimeToCloseMs)}
              hint={t("timeToCloseHint", {
                before: duration(stats.totals.medianTimeToCloseBeforeMs),
              })}
              trailing={
                <Delta
                  value={percentDelta(
                    stats.totals.medianTimeToCloseMs,
                    stats.totals.medianTimeToCloseBeforeMs,
                  )}
                  goodWhen="down"
                />
              }
            />
            <Kpi
              label={t("unanswered")}
              value={stats.totals.unanswered}
              hint={t("unansweredHint", { withdrawn: stats.totals.withdrawn })}
              tone={stats.totals.unanswered > 0 ? "warn" : "neutral"}
            />
          </KpiStrip>

          <FlowPanel stats={stats} />

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Panel title={t("byType")} bodyClassName="p-0">
              <BreakdownTable
                head={[t("type"), t("count"), t("firstResponseShort")]}
                rows={stats.byType.map((row) => ({
                  key: row.type,
                  cells: [ti(`types.${row.type}`), row.count, duration(row.medianFirstResponseMs)],
                  share: stats.totals.received ? row.count / stats.totals.received : 0,
                }))}
              />
            </Panel>
            <Panel title={t("byAssignee")} bodyClassName="p-0">
              {stats.byAssignee.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">{t("nothing")}</p>
              ) : (
                <BreakdownTable
                  head={[t("assignee"), t("count"), t("firstResponseShort")]}
                  rows={stats.byAssignee.map((row) => ({
                    key: row.userId ?? "none",
                    cells: [
                      row.name ?? ti("unassigned"),
                      t("answeredOf", { answered: row.answered, count: row.count }),
                      duration(row.medianFirstResponseMs),
                    ],
                    share: stats.totals.received ? row.count / stats.totals.received : 0,
                  }))}
                />
              )}
            </Panel>
            <Panel title={t("satisfaction")} bodyClassName="px-5 py-4">
              <Satisfaction stats={stats} />
            </Panel>
            <Panel title={t("tags")} bodyClassName="p-0">
              {stats.tags.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">{t("noTags")}</p>
              ) : (
                <BreakdownTable
                  head={[t("tag"), t("count")]}
                  rows={stats.tags.map((row) => ({
                    key: row.tag,
                    cells: [row.tag, row.count],
                    share: stats.totals.received ? row.count / stats.totals.received : 0,
                  }))}
                />
              )}
            </Panel>
          </div>

          <p className="mt-6 text-xs leading-5 text-muted-foreground">
            {t("footnote")}
            {stats.truncated ? ` ${t("truncated")}` : ""}
          </p>
        </>
      )}
    </div>
  );
}

/** Share of "helpful" among the answers rated in the period, and the latest "no"s to read. */
function Satisfaction({ stats }: { stats: Stats }) {
  const t = useTranslations("Inquiries.stats");
  const format = useFormatter();
  const { helpful, notHelpful, recentUnhelpful } = stats.satisfaction;
  const total = helpful + notHelpful;
  if (total === 0) return <p className="text-sm text-muted-foreground">{t("noRatings")}</p>;

  return (
    <div>
      <p className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">
          {format.number(helpful / total, { style: "percent" })}
        </span>
        <span className="text-sm text-muted-foreground">
          {t("helpfulShare", { helpful, total })}
        </span>
      </p>
      {recentUnhelpful.length ? (
        <>
          <h3 className="mt-4 text-xs font-medium text-muted-foreground">{t("recentUnhelpful")}</h3>
          <ul className="mt-1.5 space-y-2">
            {recentUnhelpful.map((entry) => (
              <li key={entry.id} className="text-sm">
                <Link href={`/inquiries/${entry.id}`} className="tabular-nums hover:underline">
                  {entry.reference}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {" · "}
                  {format.dateTime(new Date(entry.ratedAt), { month: "short", day: "numeric" })}
                </span>
                {entry.comment ? (
                  <p className="line-clamp-2 text-muted-foreground">{entry.comment}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/** "3 h", "1.5 d", "25 min"; a dash when there's nothing to measure. */
function useDuration() {
  const t = useTranslations("Inquiries.stats");
  const format = useFormatter();
  return (ms: number | undefined) => {
    if (ms === undefined) return "–";
    const minutes = ms / 60_000;
    if (minutes < 60) return t("minutes", { value: Math.max(1, Math.round(minutes)) });
    const hours = minutes / 60;
    if (hours < 48) {
      return t("hours", {
        value: format.number(hours, { maximumFractionDigits: hours < 10 ? 1 : 0 }),
      });
    }
    return t("daysShort", { value: format.number(hours / 24, { maximumFractionDigits: 1 }) });
  };
}

function FlowPanel({ stats }: { stats: Stats }) {
  const t = useTranslations("Inquiries.stats");
  const format = useFormatter();
  const [view, setView] = useState<"chart" | "table">("chart");

  const config: ChartConfig = useMemo(
    () =>
      Object.fromEntries(
        SERIES.map((s) => [s.key, { label: t(s.key), color: `var(--chart-${s.slot})` }]),
      ),
    [t],
  );
  const rows = useMemo(
    () =>
      stats.series.map((point) => ({
        ...point,
        label: format.dateTime(new Date(point.from), { month: "short", day: "numeric" }),
      })),
    [stats.series, format],
  );

  return (
    <Panel
      className="mt-6"
      title={t("flow")}
      description={t(stats.bucket === "day" ? "flowHintDay" : "flowHintWeek")}
      bodyClassName="px-2 pb-2 pt-3 sm:px-4"
      action={
        <div
          className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-panel-2 p-0.5"
          role="group"
          aria-label={t("view")}
        >
          {(
            [
              ["chart", LineChartIcon, t("viewChart")],
              ["table", Table2, t("viewTable")],
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
      }
    >
      {view === "table" ? (
        <div className="max-h-[260px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border/60 text-left text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">
                  {t(stats.bucket === "day" ? "tableDay" : "tableWeek")}
                </th>
                {SERIES.map((s) => (
                  <th key={s.key} scope="col" className="px-3 py-2 text-right font-medium">
                    {t(s.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((row) => (
                <tr key={row.from} className="border-b border-border/40 last:border-0">
                  <th
                    scope="row"
                    className="px-3 py-1.5 text-left font-normal text-muted-foreground"
                  >
                    {row.label}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums">{row.received}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{row.closed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ChartContainer config={config} className="h-[260px] w-full">
          <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
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
            {SERIES.map((s) => (
              <Line
                key={s.key}
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
            <ChartLegend content={<ChartLegendContent markShape="line" />} />
          </ComposedChart>
        </ChartContainer>
      )}
    </Panel>
  );
}

/** A small table with a share bar under the first column — the numbers stay in text. */
function BreakdownTable({
  head,
  rows,
}: {
  head: string[];
  rows: { key: string; cells: (string | number)[]; share: number }[];
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
          {head.map((label, i) => (
            <th
              key={label}
              scope="col"
              className={cn("px-5 py-2 font-medium", i > 0 && "text-right")}
            >
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-b border-border/40 last:border-0">
            {row.cells.map((cell, i) =>
              i === 0 ? (
                <th key={i} scope="row" className="px-5 py-2 text-left font-normal">
                  <span className="block truncate">{cell}</span>
                  <span aria-hidden className="mt-1 block h-1 rounded-full bg-muted">
                    <span
                      className="block h-1 rounded-full bg-[var(--chart-1)]"
                      style={{ width: `${Math.round(row.share * 100)}%` }}
                    />
                  </span>
                </th>
              ) : (
                <td key={i} className="px-5 py-2 text-right tabular-nums">
                  {cell}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
