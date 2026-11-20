"use client";

import { useState } from "react";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { CheckCircle2, ChevronRight, Hourglass, Send, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  CHECK_KPI_META,
  DueBadge,
  fmtDay,
  fmtKpi,
  KpiCompare,
  RatingDot,
} from "@/components/performance/checks/checkUi";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

type Mine = FunctionReturnType<typeof api.performance.checks.mine>;
type Item = Mine["open"][number];
type Check = Mine["checks"][number];

function fmtStamp(ms: number): string {
  return new Date(ms).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
}

/** One agreement/measure: status, and the employee's own "report done". */
function ItemRow({ item, onReport }: { item: Item; onReport: (item: Item) => void }) {
  const t = useTranslations("Performance.checks");
  const handleError = useErrorHandler();
  const reportDone = useMutation(api.performance.checks.reportDone);
  const done = item.doneAt !== null;
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      {done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-label={t("done")} />
      ) : (
        <DueBadge dueDate={item.dueDate} tone={item.tone} />
      )}
      <span className={cn("min-w-48 flex-1", done && "text-muted-foreground line-through")}>
        {item.text}
        {item.kpiKey && (
          <span className="ml-1 text-xs text-muted-foreground">({t(`kpi.${item.kpiKey}`)})</span>
        )}
        {item.reportNote && (
          <span className="block text-xs text-muted-foreground">„{item.reportNote}“</span>
        )}
      </span>
      {done ? (
        <span className="text-xs text-muted-foreground">
          {item.doneByName ? t("doneBy", { name: item.doneByName }) : t("done")}
        </span>
      ) : item.reportedAt !== null ? (
        <>
          <Badge variant="warning" className="gap-1">
            <Hourglass className="h-3 w-3" />
            {t("mine.reported")}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-muted-foreground"
            onClick={() => reportDone({ actionId: item.id, reported: false }).catch(handleError)}
          >
            <Undo2 className="mr-1.5 h-4 w-4" />
            {t("mine.undoReport")}
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" className="h-8" onClick={() => onReport(item)}>
          <Send className="mr-1.5 h-4 w-4" />
          {t("mine.report")}
        </Button>
      )}
    </li>
  );
}

function ReportDialog({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const t = useTranslations("Performance.checks");
  const handleError = useErrorHandler();
  const reportDone = useMutation(api.performance.checks.reportDone);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!item) return;
    setBusy(true);
    try {
      await reportDone({ actionId: item.id, reported: true, note: note || undefined });
      toast.success(t("mine.reportedToast"));
      setNote("");
      onClose();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("mine.reportTitle")}</DialogTitle>
          <DialogDescription>{item?.text}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("mine.reportHint")}</p>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("mine.reportNote")}
          rows={3}
          maxLength={500}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("mine.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            <Send className="mr-1.5 h-4 w-4" />
            {t("mine.report")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A check, read-only: confirmation, KPI table with ratings, Top/Go for,
 * agreements and the note. */
function CheckCard({
  check,
  open,
  onReport,
}: {
  check: Check;
  open: boolean;
  onReport: (item: Item) => void;
}) {
  const t = useTranslations("Performance.checks");
  const handleError = useErrorHandler();
  const acknowledge = useMutation(api.performance.checks.acknowledge);
  const rating = new Map(check.ratings.map((r) => [r.key, r]));
  const measure = new Map(check.actions.filter((a) => a.kpiKey).map((a) => [a.kpiKey!, a]));
  const agreements = check.actions.filter((a) => !a.kpiKey);
  const needsAck = check.acknowledgedAt === null || check.changedSinceAck;
  const rows = check.kpis.rows.filter((row) => {
    const r = rating.get(row.key);
    // Spot checks have no figure: only worth a line when rated or noted.
    return (
      CHECK_KPI_META[row.key]?.unit !== "check" || r?.rating || r?.note || measure.has(row.key)
    );
  });

  return (
    <Card>
      <details open={open} className="group">
        <summary className="flex cursor-pointer select-none flex-wrap items-center gap-3 px-6 py-4">
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
          <span className="font-semibold tabular-nums">{fmtDay(check.date)}</span>
          <span className="text-sm text-muted-foreground">
            {t("by", { name: check.createdByName })}
          </span>
          <span className="flex-1" />
          {needsAck ? (
            <Badge variant="warning">{t("mine.ackPending")}</Badge>
          ) : (
            <Badge variant="success">
              {t("mine.ackDone", { date: fmtStamp(check.acknowledgedAt!) })}
            </Badge>
          )}
        </summary>

        <div className="space-y-4 border-t px-6 py-4">
          {needsAck && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">
              <span className="min-w-60 flex-1">
                {check.changedSinceAck && (
                  <span className="mb-1 block font-medium">{t("mine.changedSinceAck")}</span>
                )}
                {t("signatureText")}
              </span>
              <Button
                size="sm"
                onClick={() =>
                  acknowledge({ checkId: check.id })
                    .then(() => toast.success(t("mine.ackToast")))
                    .catch(handleError)
                }
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                {t("mine.ackButton")}
              </Button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">{t("colKpi")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("colMonth")}</th>
                  <th className="px-2 py-2 font-medium">{t("colVm")}</th>
                  <th className="px-2 py-2 font-medium">{t("colVj")}</th>
                  <th className="px-2 py-2 text-center font-medium">{t("colRating")}</th>
                  <th className="py-2 pl-2 font-medium">
                    {t("colNote")} / {t("colMeasure")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isCheck = CHECK_KPI_META[row.key]?.unit === "check";
                  const r = rating.get(row.key);
                  const m = measure.get(row.key);
                  return (
                    <tr key={row.key} className="border-b align-top last:border-0">
                      <td className="py-2 pr-2 font-medium">{t(`kpi.${row.key}`)}</td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">
                        {isCheck ? "" : fmtKpi(row.month, row.key)}
                      </td>
                      <td className="px-2 py-2">
                        <KpiCompare value={row.month} reference={row.vm} kpiKey={row.key} />
                      </td>
                      <td className="px-2 py-2">
                        <KpiCompare value={row.month} reference={row.vj} kpiKey={row.key} />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <RatingDot rating={r?.rating} />
                      </td>
                      <td className="py-2 pl-2">
                        {r?.note}
                        {m && (
                          <div className="text-muted-foreground">
                            → {m.text}
                            {m.dueDate ? ` (${t("due")} ${fmtDay(m.dueDate)})` : ""}
                            {m.doneAt !== null ? " ✓" : ""}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("asOf", { date: fmtDay(check.kpis.asOf) })} · {t("frozenHint")}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {(["tops", "goFors"] as const).map((key) => (
              <div key={key}>
                <h3 className="mb-1 text-sm font-semibold">{t(key)}</h3>
                {check[key].length ? (
                  <ol className="list-decimal space-y-0.5 pl-5 text-sm">
                    {check[key].map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">–</p>
                )}
              </div>
            ))}
          </div>

          <div>
            <h3 className="mb-1 text-sm font-semibold">{t("agreements")}</h3>
            {agreements.length === 0 ? (
              <p className="text-sm text-muted-foreground">–</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {agreements.map((a) => (
                  <ItemRow key={a.id} item={a} onReport={onReport} />
                ))}
              </ul>
            )}
          </div>

          {check.note && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">{t("note")}</h3>
              <p className="whitespace-pre-wrap text-sm">{check.note}</p>
            </div>
          )}
        </div>
      </details>
    </Card>
  );
}

/** "Meine Ziele": the sales employee's own checks, read-only, with the open
 * agreements and measures to report done. */
export default function MyGoalsPage() {
  const t = useTranslations("Performance.checks");
  const params = useParams<{ id: string }>();
  const employeeId = params.id as Id<"performanceEmployees">;
  const data = useQuery(api.performance.checks.mine, { employeeId });
  const [reporting, setReporting] = useState<Item | null>(null);

  if (!data) return <PerformanceContentSkeleton />;

  const overdue = data.open.filter((i) => i.tone === "overdue").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
          <div>
            <div className="text-xs text-muted-foreground">{t("lastCheck")}</div>
            <div className="font-medium">
              {data.lastCheck ? fmtDay(data.lastCheck) : t("never")}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("mine.nextCheck")}</div>
            <div className="font-medium">{data.nextDue ? fmtDay(data.nextDue) : "–"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("openItems")}</div>
            <div className="flex items-center gap-2 font-medium">
              {data.open.length}
              {overdue > 0 && (
                <Badge variant="destructive">{t("overdueCount", { count: overdue })}</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="px-1 text-xs text-muted-foreground">{t("mine.intro")}</p>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {t("mine.openTitle")}{" "}
            <span className="text-muted-foreground">({data.open.length})</span>
          </CardTitle>
        </CardHeader>
        {data.open.length === 0 ? (
          <CardContent className="text-sm text-muted-foreground">{t("noOpen")}</CardContent>
        ) : (
          <ul className="divide-y border-t">
            {data.open.map((item) => (
              <ItemRow key={item.id} item={item} onReport={setReporting} />
            ))}
          </ul>
        )}
      </Card>

      {data.checks.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {t("mine.empty")}
          </CardContent>
        </Card>
      ) : (
        data.checks.map((c, i) => (
          <CheckCard key={c.id} check={c} open={i === 0} onReport={setReporting} />
        ))
      )}

      <ReportDialog item={reporting} onClose={() => setReporting(null)} />
    </div>
  );
}
