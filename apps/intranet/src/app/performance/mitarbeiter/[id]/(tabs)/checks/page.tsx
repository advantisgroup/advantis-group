"use client";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ClipboardCheck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { fmtDay, RatingCounts } from "@/components/performance/checks/checkUi";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";

/** An employee's checks (team leads and admins only — both may delete). */
export default function ChecksPage() {
  const t = useTranslations("Performance.checks");
  const params = useParams<{ id: string }>();
  const employeeId = params.id as Id<"performanceEmployees">;
  const data = useQuery(api.performance.checks.listForEmployee, { employeeId });
  const remove = useMutation(api.performance.checks.remove);
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const base = `/performance/mitarbeiter/${employeeId}/checks`;

  async function onDelete(checkId: Id<"performanceChecks">, date: string) {
    const ok = await confirm({
      title: t("deleteConfirmDate", { date: fmtDay(date) }),
      description: t("deleteHint"),
      confirmLabel: t("delete"),
    });
    if (!ok) return;
    try {
      await remove({ checkId });
      toast.success(t("deleted"));
    } catch (err) {
      handleError(err);
    }
  }

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
              <li key={c.id} className="flex items-center hover:bg-muted/50">
                <Link
                  href={`${base}/${c.id}`}
                  className="flex flex-1 flex-wrap items-center gap-3 px-4 py-3"
                >
                  <span className="w-24 font-medium tabular-nums">{fmtDay(c.date)}</span>
                  <Badge>{t("typeEmployee")}</Badge>
                  <RatingCounts counts={c.ratings} />
                  <span className="flex-1" />
                  {c.total > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t("doneOf", { done: c.done, total: c.total })}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {t("by", { name: c.createdByName })}
                  </span>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mr-2 h-8 px-2 text-muted-foreground hover:text-destructive"
                  onClick={() => void onDelete(c.id, c.date)}
                  aria-label={t("delete")}
                  title={t("delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
