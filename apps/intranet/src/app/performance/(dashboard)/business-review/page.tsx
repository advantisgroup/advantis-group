"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Printer, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { DueBadge, fmtDay } from "@/components/performance/checks/checkUi";
import { ReviewCell } from "@/components/performance/checks/reviewUi";
import { usePerformanceAccess } from "@/components/performance/PerformanceAccess";
import { fmtYm } from "@/components/performance/PerformanceFormat";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

interface MeasureDraft {
  id?: string;
  employeeId?: string;
  text: string;
  dueDate?: string;
  done: boolean;
}

function lastMonths(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i + 1, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default function BusinessReviewPage() {
  const t = useTranslations("Performance.checks");
  const locale = useLocale();
  const handleError = useErrorHandler();
  const { dashboard } = usePerformanceAccess();
  const months = useMemo(() => lastMonths(13), []);
  const [ym, setYm] = useState<string>(months[1]);
  const data = useQuery(
    api.performance.reviews.get,
    dashboard ? { companyId: dashboard.companyId, ym } : "skip",
  );
  const save = useMutation(api.performance.reviews.save);
  const setActionDone = useMutation(api.performance.checks.setActionDone);
  const [notes, setNotes] = useState("");
  const [measures, setMeasures] = useState<MeasureDraft[]>([]);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data || loaded === data.ym) return;
    setNotes(data.review.notes);
    setMeasures(
      data.review.actions.map((a) => ({
        id: a.id,
        employeeId: a.employeeId ?? undefined,
        text: a.text,
        dueDate: a.dueDate ?? undefined,
        done: a.done,
      })),
    );
    setLoaded(data.ym);
  }, [data, loaded]);

  if (!data || !dashboard) return <PerformanceContentSkeleton />;

  const update = (i: number, patch: Partial<MeasureDraft>) =>
    setMeasures((prev) => prev.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  async function onSave() {
    if (!dashboard || !data) return;
    setBusy(true);
    try {
      await save({
        companyId: dashboard.companyId,
        ym: data.ym,
        notes,
        actions: measures.map((m) => ({
          id: m.id as Id<"performanceActions"> | undefined,
          employeeId: m.employeeId as Id<"performanceEmployees"> | undefined,
          text: m.text,
          dueDate: m.dueDate,
          done: m.done,
        })),
      });
      setLoaded(null);
      toast.success(t("reviewSaved"));
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">
          {t("reviewTitle", { month: fmtYm(data.ym, locale) })}
        </h2>
        <Select
          value={ym}
          onValueChange={(v) => {
            setYm(v);
            setLoaded(null);
          }}
        >
          <SelectTrigger className="w-48" aria-label={t("reviewMonth")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                {fmtYm(m, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!data.monthDone && <Badge variant="warning">{t("reviewRunning")}</Badge>}
        <div className="flex-1" />
        <a
          href={`/performance/druck/business-review?ym=${data.ym}&companyId=${dashboard.companyId}`}
          target="_blank"
          rel="noreferrer"
        >
          <Button variant="outline" size="sm">
            <Printer className="mr-1.5 h-4 w-4" />
            {t("print")}
          </Button>
        </a>
      </div>
      <p className="text-xs text-muted-foreground">{t("reviewIntro")}</p>

      <Card>
        <CardContent className="overflow-x-auto px-0 py-2">
          <table className="w-full min-w-[1200px] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="sticky left-0 bg-card px-4 py-2 text-left font-medium">
                  {t("employees")}
                </th>
                {data.columns.map((c) => (
                  <th key={c} className="px-2 py-2 text-right font-medium">
                    {t(`col.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.employeeId} className="border-b">
                  <td className="sticky left-0 bg-card px-4 py-2">
                    <Link
                      href={`/performance/mitarbeiter/${r.employeeId}/checks`}
                      className="font-medium hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  {data.columns.map((c) => (
                    <td key={c} className="px-2 py-2">
                      <ReviewCell col={c} cur={r.cur[c]} vm={r.vm[c]} vj={r.vj[c]} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-muted/40">
                <td className="sticky left-0 bg-muted/40 px-4 py-2 font-semibold">{t("team")}</td>
                {data.columns.map((c) => (
                  <td key={c} className="px-2 py-2">
                    <ReviewCell
                      col={c}
                      cur={data.total.cur[c]}
                      vm={data.total.vm[c]}
                      vj={data.total.vj[c]}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("reviewChecks")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {data.checks.length === 0 && (
              <p className="text-muted-foreground">{t("reviewNoChecks")}</p>
            )}
            {data.checks.map((c) => (
              <div key={c.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums">{fmtDay(c.date)}</span>
                  <Link
                    href={`/performance/mitarbeiter/${c.employeeId}/checks/${c.id}`}
                    className="font-medium hover:underline"
                  >
                    {c.employeeName}
                  </Link>
                  <Badge variant={c.type === "employee" ? "default" : "secondary"}>
                    {c.type === "employee" ? t("typeEmployee") : t("typeKpi")}
                  </Badge>
                </div>
                {c.tops.length > 0 && (
                  <p className="mt-1 text-xs">
                    <b>{t("tops")}:</b> {c.tops.join(" · ")}
                  </p>
                )}
                {c.goFors.length > 0 && (
                  <p className="text-xs">
                    <b>{t("goFors")}:</b> {c.goFors.join(" · ")}
                  </p>
                )}
                {c.red.length > 0 && (
                  <p className="text-xs text-destructive">
                    {t("redKpis", { list: c.red.map((k) => t(`kpi.${k}`)).join(", ") })}
                  </p>
                )}
                {c.note && <p className="mt-1 text-xs text-muted-foreground">{c.note}</p>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("reviewActions")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.actions.length === 0 && <p className="text-muted-foreground">{t("noOpen")}</p>}
            {data.actions.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2">
                <Checkbox
                  checked={a.done}
                  onCheckedChange={(v) =>
                    setActionDone({ actionId: a.id, done: v === true }).catch(handleError)
                  }
                  aria-label={t("done")}
                />
                {!a.done && <DueBadge dueDate={a.dueDate} tone={a.tone} />}
                <span className={cn("flex-1", a.done && "text-muted-foreground line-through")}>
                  {a.text}
                </span>
                <span className="text-xs text-muted-foreground">
                  {a.employeeName ?? t("wholeTeam")} · {t(`source.${a.source}`)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">{t("reviewNotes")}</CardTitle>
          <Button size="sm" onClick={() => void onSave()} disabled={busy}>
            <Save className="mr-1.5 h-4 w-4" />
            {t("save")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder={t("reviewNotesPlaceholder")}
          />
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("reviewMeasures")}</p>
            {measures.map((m, i) => (
              <div key={m.id ?? `new-${i}`} className="flex flex-wrap items-center gap-2">
                <Checkbox
                  checked={m.done}
                  onCheckedChange={(v) => update(i, { done: v === true })}
                  aria-label={t("done")}
                />
                <Input
                  value={m.text}
                  onChange={(e) => update(i, { text: e.target.value })}
                  className={cn("min-w-48 flex-1", m.done && "text-muted-foreground line-through")}
                />
                <Select
                  value={m.employeeId ?? "team"}
                  onValueChange={(v) => update(i, { employeeId: v === "team" ? undefined : v })}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="team">{t("wholeTeam")}</SelectItem>
                    {data.rows.map((r) => (
                      <SelectItem key={r.employeeId} value={r.employeeId}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">{t("due")}</span>
                <Input
                  type="date"
                  value={m.dueDate ?? ""}
                  onChange={(e) => update(i, { dueDate: e.target.value || undefined })}
                  className="w-40"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-muted-foreground"
                  onClick={() => setMeasures((prev) => prev.filter((_, j) => j !== i))}
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMeasures((prev) => [...prev, { text: "", done: false }])}
            >
              {t("addMeasure")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
