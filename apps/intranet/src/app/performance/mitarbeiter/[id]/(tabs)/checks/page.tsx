"use client";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { ClipboardCheck, Gauge } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { fmtDay, RatingCounts } from "@/components/performance/checks/checkUi";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** An employee's checks (team leads and admins only). */
export default function ChecksPage() {
  const t = useTranslations("Performance.checks");
  const params = useParams<{ id: string }>();
  const employeeId = params.id as Id<"performanceEmployees">;
  const data = useQuery(api.performance.checks.listForEmployee, { employeeId });
  const base = `/performance/mitarbeiter/${employeeId}/checks`;

  if (!data) return <PerformanceContentSkeleton />;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
          <div>
            <div className="text-xs text-muted-foreground">{t("lastCheck")}</div>
            <div className="font-medium">
              {data.lastEmployeeCheck ? fmtDay(data.lastEmployeeCheck) : t("never")}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("nextDue")}</div>
            <div className="flex items-center gap-2 font-medium">
              {data.nextDue ? fmtDay(data.nextDue) : "–"}
              {data.overdue && <Badge variant="destructive">{t("overdue")}</Badge>}
            </div>
          </div>
          <div className="flex-1" />
          <Link href={`${base}/neu`}>
            <Button size="sm">
              <ClipboardCheck className="mr-1.5 h-4 w-4" />
              {t("newEmployeeCheck")}
            </Button>
          </Link>
          <Link href={`${base}/neu?typ=kpi`}>
            <Button size="sm" variant="outline">
              <Gauge className="mr-1.5 h-4 w-4" />
              {t("newKpiCheck")}
            </Button>
          </Link>
        </CardContent>
      </Card>

      <p className="px-1 text-xs text-muted-foreground">{t("intro")}</p>

      <Card>
        {data.checks.length === 0 ? (
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </CardContent>
        ) : (
          <ul className="divide-y">
            {data.checks.map((c) => (
              <li key={c.id}>
                <Link
                  href={`${base}/${c.id}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/50"
                >
                  <span className="w-24 font-medium tabular-nums">{fmtDay(c.date)}</span>
                  <Badge variant={c.type === "employee" ? "default" : "secondary"}>
                    {c.type === "employee" ? t("typeEmployee") : t("typeKpi")}
                  </Badge>
                  <RatingCounts counts={c.ratings} />
                  <span className="flex-1" />
                  {c.total > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t("openOf", { open: c.open, total: c.total })}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {t("by", { name: c.createdByName })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
