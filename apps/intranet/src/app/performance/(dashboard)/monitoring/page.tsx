"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { ChevronRight, ClipboardCheck, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { DueBadge, fmtDay, type Rating } from "@/components/performance/checks/checkUi";
import { usePerformanceAccess } from "@/components/performance/PerformanceAccess";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type Monitoring = FunctionReturnType<typeof api.performance.checks.monitoring>;
type Item = Monitoring["open"][number];
type EmployeeRow = Monitoring["employees"][number];

const STATUS_VARIANT = {
  never: "destructive",
  overdue: "destructive",
  due: "warning",
  ok: "success",
} as const;

function worst(r: Record<Rating, number>): Rating {
  return r.red ? "red" : r.yellow ? "yellow" : "green";
}

/** Checks of the last 6 months on one line, positioned by date; colour =
 * worst rating of the check. */
function CheckTimeline({ row, today }: { row: EmployeeRow; today: string }) {
  const end = Date.parse(`${today}T00:00:00Z`);
  const start = end - 182 * 86_400_000;
  const fill = { green: "bg-ok", yellow: "bg-warn", red: "bg-destructive" } as const;
  return (
    <div className="relative h-5 w-full min-w-32 rounded bg-muted/60">
      {row.checks
        .filter((c) => Date.parse(`${c.date}T00:00:00Z`) >= start)
        .map((c) => {
          const x = ((Date.parse(`${c.date}T00:00:00Z`) - start) / (end - start)) * 100;
          return (
            <span
              key={c.id}
              title={fmtDay(c.date)}
              className={cn(
                "absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full",
                fill[worst(c.ratings)],
              )}
              style={{ left: `${Math.min(98, Math.max(2, x))}%` }}
            />
          );
        })}
    </div>
  );
}

function ItemRow({
  item,
  onToggle,
  showPerson,
}: {
  item: Item;
  onToggle: (item: Item, done: boolean) => void;
  showPerson?: boolean;
}) {
  const t = useTranslations("Performance.checks");
  const done = item.doneAt !== null;
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <Checkbox
        checked={done}
        onCheckedChange={(v) => onToggle(item, v === true)}
        aria-label={t("done")}
      />
      {!done && <DueBadge dueDate={item.dueDate} tone={item.tone} />}
      <span className={cn("min-w-48 flex-1", done && "text-muted-foreground line-through")}>
        {item.text}
        {item.kpiKey && (
          <span className="ml-1 text-xs text-muted-foreground">({t(`kpi.${item.kpiKey}`)})</span>
        )}
      </span>
      <span className="text-xs text-muted-foreground">
        {showPerson && `${item.employeeName ?? t("wholeTeam")} · `}
        {t(`source.${item.source}`)}
        {done && item.doneByName ? ` · ${t("doneBy", { name: item.doneByName })}` : ""}
      </span>
      {item.checkId && item.employeeId && (
        <Link
          href={`/performance/mitarbeiter/${item.employeeId}/checks/${item.checkId}`}
          className="text-muted-foreground hover:text-foreground"
          aria-label={t("openCheck")}
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </li>
  );
}

/** One person's (or the whole team's) open points, foldable. */
function PersonGroup({
  title,
  href,
  items,
  onToggle,
}: {
  title: string;
  href?: string;
  items: Item[];
  onToggle: (item: Item, done: boolean) => void;
}) {
  const t = useTranslations("Performance.checks");
  const overdue = items.filter((i) => i.tone === "overdue").length;
  return (
    <details open className="group border-b last:border-0">
      <summary className="flex cursor-pointer select-none items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
        <span className="font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">
          {t("openCount", { count: items.length })}
        </span>
        {overdue > 0 && (
          <Badge variant="destructive">{t("overdueCount", { count: overdue })}</Badge>
        )}
        <span className="flex-1" />
        {href && (
          <Link
            href={href}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            {t("toChecks")}
          </Link>
        )}
      </summary>
      <ul className="divide-y border-t bg-muted/10">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} onToggle={onToggle} />
        ))}
      </ul>
    </details>
  );
}

export default function MonitoringPage() {
  const t = useTranslations("Performance.checks");
  const handleError = useErrorHandler();
  const { dashboard } = usePerformanceAccess();
  const data = useQuery(
    api.performance.checks.monitoring,
    dashboard ? { companyId: dashboard.companyId } : "skip",
  );
  const setActionDone = useMutation(api.performance.checks.setActionDone);
  const setTopicDone = useMutation(api.performance.checks.setTopicDone);

  if (!data) return <PerformanceContentSkeleton />;

  const toggle = (item: Item, done: boolean) => {
    const p =
      item.kind === "action"
        ? setActionDone({ actionId: item.id as Id<"performanceActions">, done })
        : setTopicDone({ topicId: item.id as Id<"performanceTopics">, done });
    p.catch(handleError);
  };

  const count = (s: EmployeeRow["status"]) => data.employees.filter((e) => e.status === s).length;
  const overdueItems = data.open.filter((i) => i.tone === "overdue").length;
  // Open points per person, in the employee list's order; team-wide last.
  const groups = [
    ...data.employees.map((e) => ({
      key: e.id as string,
      title: e.name,
      href: `/performance/mitarbeiter/${e.id}/checks`,
      items: data.open.filter((i) => i.employeeId === e.id),
    })),
    {
      key: "team",
      title: t("wholeTeamTitle"),
      href: undefined,
      items: data.open.filter((i) => !i.employeeId),
    },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      <KpiStrip>
        <Kpi label={t("status.ok")} value={count("ok")} />
        <Kpi
          label={t("status.due")}
          value={count("due")}
          tone={count("due") ? "warn" : "neutral"}
        />
        <Kpi
          label={t("statusMissing")}
          value={count("overdue") + count("never")}
          tone={count("overdue") + count("never") ? "critical" : "neutral"}
        />
        <Kpi
          label={t("openItems")}
          value={data.open.length}
          hint={overdueItems ? t("overdueCount", { count: overdueItems }) : undefined}
          tone={overdueItems ? "critical" : "neutral"}
        />
      </KpiStrip>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-muted-foreground" />
            {t("employees")}
          </CardTitle>
        </CardHeader>
        <ul className="divide-y border-t">
          {data.employees.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <Link
                href={`/performance/mitarbeiter/${e.id}/checks`}
                className="flex min-w-52 items-center gap-3 hover:underline"
              >
                <Avatar className="size-9">
                  <AvatarFallback className="text-xs font-semibold">
                    {initials(e.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{e.name}</span>
                  <Badge variant={STATUS_VARIANT[e.status]} className="mt-0.5">
                    {t(`status.${e.status}`)}
                  </Badge>
                </span>
              </Link>
              <div className="w-28 text-xs">
                <div className="text-muted-foreground">{t("lastCheckShort")}</div>
                <div className="tabular-nums">
                  {e.lastEmployeeCheck ? fmtDay(e.lastEmployeeCheck) : "–"}
                </div>
              </div>
              <div className="w-28 text-xs">
                <div className="text-muted-foreground">{t("nextDue")}</div>
                <div className="tabular-nums">{e.nextDue ? fmtDay(e.nextDue) : "–"}</div>
              </div>
              <div className="hidden min-w-40 flex-1 md:block">
                <CheckTimeline row={e} today={data.today} />
              </div>
              <div className="w-32 text-xs tabular-nums text-muted-foreground">
                {e.open + e.done > 0
                  ? t("doneOf", { done: e.done, total: e.open + e.done })
                  : t("noItems")}
              </div>
              <Link href={`/performance/mitarbeiter/${e.id}/checks/neu`}>
                <Button size="sm" variant="outline">
                  <ClipboardCheck className="mr-1.5 h-4 w-4" />
                  {t("newCheck")}
                </Button>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {t("openItems")} <span className="text-muted-foreground">({data.open.length})</span>
          </CardTitle>
          <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive" /> {t("tone.overdue")}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> {t("tone.soon")}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-ok" /> {t("tone.week")}
            </span>
          </p>
        </CardHeader>
        {groups.length === 0 ? (
          <CardContent className="text-sm text-muted-foreground">{t("noOpen")}</CardContent>
        ) : (
          <div className="border-t">
            {groups.map((g) => (
              <PersonGroup
                key={g.key}
                title={g.title}
                href={g.href}
                items={g.items}
                onToggle={toggle}
              />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <details>
          <summary className="cursor-pointer select-none px-6 py-4 text-base font-semibold">
            {t("doneItems")}{" "}
            <span className="font-normal text-muted-foreground">({data.done.length})</span>
          </summary>
          {data.done.length === 0 ? (
            <CardContent className="text-sm text-muted-foreground">{t("noDone")}</CardContent>
          ) : (
            <ul className="divide-y border-t">
              {data.done.map((item) => (
                <ItemRow key={item.id} item={item} onToggle={toggle} showPerson />
              ))}
            </ul>
          )}
        </details>
      </Card>
    </div>
  );
}
