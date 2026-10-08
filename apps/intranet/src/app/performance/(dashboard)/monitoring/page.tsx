"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { DueBadge, fmtDay, type Rating } from "@/components/performance/checks/checkUi";
import { usePerformanceAccess } from "@/components/performance/PerformanceAccess";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useErrorHandler } from "@/hooks/use-error-handler";
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

/** Checks of the last 6 months on one line, positioned by date. Filled
 * dot = employee check, ring = KPI check; colour = worst rating. */
function CheckTimeline({ row, today }: { row: EmployeeRow; today: string }) {
  const end = Date.parse(`${today}T00:00:00Z`);
  const start = end - 182 * 86_400_000;
  const fill = { green: "bg-ok", yellow: "bg-warn", red: "bg-destructive" } as const;
  const ring = {
    green: "border-2 border-ok bg-background",
    yellow: "border-2 border-warn bg-background",
    red: "border-2 border-destructive bg-background",
  } as const;
  return (
    <div className="relative h-5 w-full min-w-40 rounded bg-muted/60">
      {row.checks
        .filter((c) => Date.parse(`${c.date}T00:00:00Z`) >= start)
        .map((c) => {
          const x = ((Date.parse(`${c.date}T00:00:00Z`) - start) / (end - start)) * 100;
          const tone = worst(c.ratings);
          return (
            <span
              key={c.id}
              title={`${fmtDay(c.date)} · ${c.type === "employee" ? "Mitarbeiter-Check" : "KPI-Check"}`}
              className={cn(
                "absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full",
                c.type === "employee" ? fill[tone] : ring[tone],
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
}: {
  item: Item;
  onToggle: (item: Item, done: boolean) => void;
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
        {item.employeeName ?? t("wholeTeam")} · {t(`source.${item.source}`)}
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("employees")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">{t("employees")}</th>
                <th className="px-2 py-2 font-medium">{t("lastCheck")}</th>
                <th className="px-2 py-2 font-medium">{t("nextDue")}</th>
                <th className="px-2 py-2 font-medium">{t("history")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("openItems")}</th>
              </tr>
            </thead>
            <tbody>
              {data.employees.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    <Link
                      href={`/performance/mitarbeiter/${e.id}/checks`}
                      className="font-medium hover:underline"
                    >
                      {e.name}
                    </Link>
                    <div>
                      <Badge variant={STATUS_VARIANT[e.status]} className="mt-0.5">
                        {t(`status.${e.status}`)}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {e.lastEmployeeCheck ? fmtDay(e.lastEmployeeCheck) : "–"}
                  </td>
                  <td className="px-2 py-2 tabular-nums">{e.nextDue ? fmtDay(e.nextDue) : "–"}</td>
                  <td className="w-1/3 px-2 py-2">
                    <CheckTimeline row={e} today={data.today} />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{e.open || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
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
        {data.open.length === 0 ? (
          <CardContent className="text-sm text-muted-foreground">{t("noOpen")}</CardContent>
        ) : (
          <ul className="divide-y">
            {data.open.map((item) => (
              <ItemRow key={item.id} item={item} onToggle={toggle} />
            ))}
          </ul>
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
                <ItemRow key={item.id} item={item} onToggle={toggle} />
              ))}
            </ul>
          )}
        </details>
      </Card>
    </div>
  );
}
