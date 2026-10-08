"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Printer, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import {
  ActionListEditor,
  type ActionDraft,
  CHECK_KPI_META,
  fmtDay,
  fmtDayShort,
  fmtKpi,
  KpiCompare,
  type Rating,
  RatingPicker,
} from "@/components/performance/checks/checkUi";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";

type CheckType = "employee" | "kpi";

interface KpiRow {
  key: string;
  month: number | null;
  vm: number | null;
  vj: number | null;
  week: number | null;
}

interface Kpis {
  asOf: string;
  week: { start: string; end: string; missingDays: string[] };
  rows: KpiRow[];
  reasons: {
    month: { reason: string; count: number }[];
    week: { reason: string; count: number }[];
  };
}

function todayIso(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

function padTo(list: string[], n: number): string[] {
  return [...list, ...Array(Math.max(0, n - list.length)).fill("")].slice(0, n);
}

/** Create (`checkId` null) or edit one employee/KPI check. */
export function CheckEditor({
  employeeId,
  checkId,
  newType,
}: {
  employeeId: Id<"performanceEmployees">;
  checkId: Id<"performanceChecks"> | null;
  newType: CheckType;
}) {
  const t = useTranslations("Performance.checks");
  const router = useRouter();
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const live = useQuery(api.performance.checks.liveKpis, checkId ? "skip" : { employeeId });
  const saved = useQuery(api.performance.checks.get, checkId ? { checkId } : "skip");
  const save = useMutation(api.performance.checks.save);
  const remove = useMutation(api.performance.checks.remove);

  const [type, setType] = useState<CheckType>(newType);
  const [date, setDate] = useState(todayIso());
  const [ratings, setRatings] = useState<Record<string, { rating?: Rating; note?: string }>>({});
  const [tops, setTops] = useState<string[]>(["", "", ""]);
  const [goFors, setGoFors] = useState<string[]>(["", "", ""]);
  const [note, setNote] = useState("");
  const [agreements, setAgreements] = useState<ActionDraft[]>([]);
  const [measures, setMeasures] = useState<Record<string, ActionDraft>>({});
  const [busy, setBusy] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // Fill the form once from the saved check.
  useEffect(() => {
    if (!saved || loadedId === saved.check._id) return;
    const c = saved.check;
    setType(c.type);
    setDate(c.date);
    setRatings(
      Object.fromEntries(c.ratings.map((r) => [r.key, { rating: r.rating, note: r.note }])),
    );
    setTops(padTo(c.tops, 3));
    setGoFors(padTo(c.goFors, 3));
    setNote(c.note ?? "");
    setAgreements(
      saved.actions
        .filter((a) => !a.kpiKey)
        .map((a) => ({ id: a.id, text: a.text, dueDate: a.dueDate ?? undefined, done: a.done })),
    );
    setMeasures(
      Object.fromEntries(
        saved.actions
          .filter((a) => a.kpiKey)
          .map((a) => [
            a.kpiKey!,
            {
              id: a.id,
              kpiKey: a.kpiKey!,
              text: a.text,
              dueDate: a.dueDate ?? undefined,
              done: a.done,
            },
          ]),
      ),
    );
    setLoadedId(c._id);
  }, [saved, loadedId]);

  const kpis: Kpis | undefined = saved?.check.kpis ?? live?.kpis;
  const employeeName = saved?.employee.name ?? live?.employee.name;
  const base = `/performance/mitarbeiter/${employeeId}/checks`;

  const reasonsLine = useMemo(() => {
    if (!kpis) return "";
    const fmt = (list: { reason: string; count: number }[]) =>
      list.length ? list.map((r) => `${r.reason} (${r.count})`).join(", ") : t("noReasons");
    return `${t("reasonsMonth")}: ${fmt(kpis.reasons.month)} · ${t("reasonsWeek")}: ${fmt(kpis.reasons.week)}`;
  }, [kpis, t]);

  if (!kpis) return <PerformanceContentSkeleton />;

  const setRating = (key: string, patch: { rating?: Rating; note?: string }) =>
    setRatings((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const setMeasure = (key: string, patch: Partial<ActionDraft>) =>
    setMeasures((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { kpiKey: key, text: "", done: false }), ...patch },
    }));

  async function onSave() {
    setBusy(true);
    try {
      const actions = [
        ...(type === "employee" ? agreements : []),
        ...Object.values(measures).filter((m) => m.text.trim()),
      ].map((a) => ({
        id: a.id as Id<"performanceActions"> | undefined,
        kpiKey: a.kpiKey,
        text: a.text,
        dueDate: a.dueDate,
        done: a.done,
      }));
      const res = await save({
        checkId: checkId ?? undefined,
        employeeId,
        type,
        date,
        ratings: Object.entries(ratings).map(([key, r]) => ({
          key,
          rating: r.rating,
          note: r.note,
        })),
        tops: type === "employee" ? tops : [],
        goFors: type === "employee" ? goFors : [],
        note,
        actions,
      });
      toast.success(t("saved"));
      if (!checkId) router.replace(`${base}/${res.checkId}`);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!checkId) return;
    const ok = await confirm({
      title: t("deleteConfirm"),
      description: t("deleteHint"),
      confirmLabel: t("delete"),
    });
    if (!ok) return;
    try {
      await remove({ checkId });
      toast.success(t("deleted"));
      router.replace(base);
    } catch (err) {
      handleError(err);
    }
  }

  const missing = kpis.week.missingDays;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={base}>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("back")}
          </Button>
        </Link>
        <Badge variant={type === "employee" ? "default" : "secondary"}>
          {type === "employee" ? t("typeEmployee") : t("typeKpi")}
        </Badge>
        <span className="font-medium">{employeeName}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("date")}</span>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex-1" />
        {checkId && (
          <>
            <a href={`/performance/druck/check/${checkId}`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                <Printer className="mr-1.5 h-4 w-4" />
                {t("print")}
              </Button>
            </a>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => void onDelete()}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              {t("delete")}
            </Button>
          </>
        )}
        <Button size="sm" onClick={() => void onSave()} disabled={busy || !date}>
          <Save className="mr-1.5 h-4 w-4" />
          {t("save")}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("asOf", { date: fmtDay(kpis.asOf) })}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("week", { from: fmtDayShort(kpis.week.start), to: fmtDayShort(kpis.week.end) })}
            {missing.length > 0 &&
              ` · ${t("weekMissing", { days: missing.map(fmtDayShort).join(", ") })}`}
            {" · "}
            {checkId ? t("frozenHint") : t("liveHint")}
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">{t("colKpi")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("colWeek")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("colMonth")}</th>
                <th className="px-2 py-2 font-medium">{t("colVm")}</th>
                <th className="px-2 py-2 font-medium">{t("colVj")}</th>
                <th className="px-2 py-2 font-medium">{t("colRating")}</th>
                <th className="px-4 py-2 font-medium">
                  {type === "kpi" ? t("colMeasure") : t("colNote")}
                </th>
              </tr>
            </thead>
            <tbody>
              {kpis.rows.map((row) => {
                const meta = CHECK_KPI_META[row.key];
                const isCheck = meta?.unit === "check";
                const m = measures[row.key];
                return (
                  <tr key={row.key} className="border-b align-top last:border-0">
                    <td className="px-4 py-2">
                      <div className="font-medium">{t(`kpi.${row.key}`)}</div>
                      {row.key === "unqualified" && (
                        <div className="mt-0.5 max-w-xs text-xs text-muted-foreground">
                          {reasonsLine}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {meta?.week ? fmtKpi(row.week, row.key) : ""}
                    </td>
                    <td className="px-2 py-2 text-right font-medium tabular-nums">
                      {isCheck ? "" : fmtKpi(row.month, row.key)}
                    </td>
                    <td className="px-2 py-2">
                      <KpiCompare value={row.month} reference={row.vm} kpiKey={row.key} />
                    </td>
                    <td className="px-2 py-2">
                      <KpiCompare value={row.month} reference={row.vj} kpiKey={row.key} />
                    </td>
                    <td className="px-2 py-2">
                      <RatingPicker
                        value={ratings[row.key]?.rating}
                        onChange={(rating) => setRating(row.key, { rating })}
                      />
                    </td>
                    <td className="space-y-1.5 px-4 py-2">
                      <Input
                        value={ratings[row.key]?.note ?? ""}
                        onChange={(e) => setRating(row.key, { note: e.target.value })}
                        placeholder={t("colNote")}
                        className="h-8"
                      />
                      {type === "kpi" && (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={m?.done ?? false}
                            onCheckedChange={(v) => setMeasure(row.key, { done: v === true })}
                            aria-label={t("done")}
                          />
                          <Input
                            value={m?.text ?? ""}
                            onChange={(e) => setMeasure(row.key, { text: e.target.value })}
                            placeholder={t("colMeasure")}
                            className="h-8 flex-1"
                          />
                          <Input
                            type="date"
                            value={m?.dueDate ?? ""}
                            onChange={(e) =>
                              setMeasure(row.key, { dueDate: e.target.value || undefined })
                            }
                            className="h-8 w-36"
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {type === "employee" && (
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["tops", tops, setTops],
              ["goFors", goFors, setGoFors],
            ] as const
          ).map(([key, list, setList]) => (
            <Card key={key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t(key)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {list.map((value, i) => (
                  <Input
                    key={i}
                    value={value}
                    onChange={(e) => setList(list.map((v, j) => (j === i ? e.target.value : v)))}
                    placeholder={`${t(key)} ${i + 1}`}
                  />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {type === "employee" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("agreements")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionListEditor
              items={agreements}
              onChange={setAgreements}
              addLabel={t("addAgreement")}
              placeholder={t("agreements")}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("note")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </CardContent>
      </Card>
    </div>
  );
}
