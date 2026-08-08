"use client";

import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { Building2, CalendarClock, MoonStar, UserPlus, UserX, Users2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import { Link } from "@/components/Link";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { relativeTime } from "@/lib/format";

import { MetricRow, Panel, PanelSkeleton, SplitBar } from "./primitives";

type Pulse = NonNullable<ReturnType<typeof usePulse>>;
function usePulse(tzOffsetMinutes: number) {
  return useQuery(api.adminOverview.pulse, { tzOffsetMinutes });
}

/** Headcount by department, plus the role mix. */
export function OrgComposition({ tzOffsetMinutes }: { tzOffsetMinutes: number }) {
  const t = useTranslations("Admin");
  const pulse = usePulse(tzOffsetMinutes);

  // One colour for every bar: departments are nominal, so shading them by size
  // would double-encode the bar length as hue and burn the only free channel on
  // information the bar already shows.
  const config: ChartConfig = {
    count: { label: t("overview.people.members"), color: "var(--chart-1)" },
  };

  const bars = useMemo(() => {
    if (!pulse) return [];
    const rows = pulse.departments.map((d) => ({ name: d.name, count: d.count }));
    if (pulse.unassignedDepartment > 0) {
      rows.push({ name: t("overview.people.unassigned"), count: pulse.unassignedDepartment });
    }
    return rows;
  }, [pulse, t]);

  return (
    <Panel
      icon={<Building2 />}
      title={t("overview.people.departmentsTitle")}
      description={t("overview.people.departmentsHint")}
      bodyClassName="px-2 pt-4 pb-2 sm:px-4"
      footer={
        pulse ? (
          <SplitBar
            segments={[
              {
                key: "admins",
                label: t("overview.people.admins"),
                value: pulse.headcount.admins,
                color: "var(--chart-1)",
              },
              {
                key: "managers",
                label: t("overview.people.managers"),
                value: pulse.headcount.managers,
                color: "var(--chart-2)",
              },
              {
                key: "employees",
                label: t("overview.people.employees"),
                value: pulse.headcount.employees,
                color: "var(--chart-3)",
              },
            ]}
          />
        ) : null
      }
    >
      {pulse === undefined ? (
        <PanelSkeleton rows={4} />
      ) : bars.length === 0 ? (
        <p className="px-2 py-8 text-center text-sm text-muted-foreground">
          {t("overview.people.noDepartments")}
        </p>
      ) : (
        // Height grows with the bar count so the category axis is never
        // compressed into an unreadable band or clipped by a fixed height.
        <ChartContainer config={config} style={{ height: Math.max(140, bars.length * 34 + 28) }}>
          <BarChart
            data={bars}
            layout="vertical"
            margin={{ top: 0, right: 28, bottom: 0, left: 0 }}
          >
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <YAxis
              dataKey="name"
              type="category"
              tickLine={false}
              axisLine={false}
              width={104}
              tickMargin={6}
            />
            <XAxis type="number" hide allowDecimals={false} />
            <ChartTooltip
              cursor={{ fill: "var(--chart-cursor)" }}
              content={<ChartTooltipContent indicator="line" hideLabel={false} />}
            />
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              // Rounded data-end, square at the baseline.
              radius={[0, 4, 4, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            >
              {/* Values ride outside the bar end, so a short bar never clips
                  its own label. */}
              <LabelList
                dataKey="count"
                position="right"
                offset={8}
                className="fill-muted-foreground"
                fontSize={11}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </Panel>
  );
}

/**
 * The account hygiene panel. Dormant and never-signed-in are kept apart because
 * they are different mistakes with different fixes: a licence nobody ever used
 * was mis-provisioned, one that went quiet was probably never offboarded.
 */
export function AccountsRadar({ tzOffsetMinutes }: { tzOffsetMinutes: number }) {
  const t = useTranslations("Admin");
  const format = useFormatter();
  const pulse = usePulse(tzOffsetMinutes);

  const names = (people: Pulse["dormant"]["people"]) =>
    people.map((p) => p.name).join(", ") || null;

  return (
    <Panel
      icon={<Users2 />}
      title={t("overview.people.accountsTitle")}
      description={t("overview.people.accountsHint")}
      bodyClassName="p-3"
    >
      {pulse === undefined ? (
        <PanelSkeleton rows={4} />
      ) : (
        <div className="space-y-0.5">
          <MetricRow
            icon={MoonStar}
            label={t("overview.people.dormant")}
            sublabel={names(pulse.dormant.people)}
            value={pulse.dormant.count}
            tone={pulse.dormant.count > 0 ? "warn" : "neutral"}
            href="/admin/members"
          />
          <MetricRow
            icon={UserX}
            label={t("overview.people.neverSignedIn")}
            sublabel={names(pulse.neverSignedIn.people)}
            value={pulse.neverSignedIn.count}
            tone={pulse.neverSignedIn.count > 0 ? "warn" : "neutral"}
            href="/admin/members"
          />
          <MetricRow
            icon={UserX}
            label={t("overview.people.suspended")}
            value={pulse.headcount.suspended}
            href="/admin/members"
          />
          {pulse.upcomingStarts.length > 0 && (
            <MetricRow
              icon={CalendarClock}
              label={t("overview.people.upcomingStarts")}
              sublabel={pulse.upcomingStarts
                .map((p) =>
                  p.hireDate
                    ? `${p.name} · ${format.dateTime(new Date(`${p.hireDate}T00:00:00Z`), {
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      })}`
                    : p.name,
                )
                .join(", ")}
              value={pulse.upcomingStarts.length}
              tone="ok"
              href="/directory"
            />
          )}

          {pulse.newest.length > 0 && (
            <>
              <p className="mt-3 px-2 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("overview.people.newestTitle")}
              </p>
              {pulse.newest.map((person) => (
                <Link
                  key={person._id}
                  href="/admin/members"
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-panel-2 text-muted-foreground ring-1 ring-inset ring-border">
                    <UserPlus className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-tight">{person.name}</p>
                    <p className="truncate text-xs leading-tight text-muted-foreground">
                      {person.department ?? t("overview.people.unassigned")}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {relativeTime(person.createdAt)}
                  </span>
                </Link>
              ))}
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
