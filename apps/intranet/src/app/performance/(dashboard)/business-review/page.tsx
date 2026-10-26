"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { Plus, Printer, Save, Trash2, Users } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

type Review = FunctionReturnType<typeof api.performance.reviews.get>;
type EntryType = "note" | "decision" | "open";

const ENTRY_TYPES: EntryType[] = ["note", "decision", "open"];

const TYPE_STYLE: Record<EntryType, string> = {
  note: "bg-muted text-muted-foreground",
  decision: "bg-primary/10 text-primary",
  open: "bg-warn/15 text-warn",
};

interface EntryDraft {
  key: string;
  id?: string;
  type: EntryType;
  employeeId?: string;
  text: string;
  dueDate?: string;
  done: boolean;
  /** Month of the earlier review the entry was carried over from. */
  fromYm?: string;
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

let draftSeq = 0;
const newKey = () => `new-${++draftSeq}`;

/** Discreet picker for who the review shows; applied right away. */
function PeoplePicker({ data, companyId }: { data: Review; companyId: Id<"companies"> }) {
  const t = useTranslations("Performance.checks");
  const handleError = useErrorHandler();
  const setHidden = useMutation(api.performance.reviews.setHidden);
  const hidden = data.employees.filter((e) => e.hidden).map((e) => e.id);
  const shown = data.employees.length - hidden.length;

  const toggle = (id: Id<"performanceEmployees">, show: boolean) => {
    const next = show ? hidden.filter((h) => h !== id) : [...hidden, id];
    setHidden({ companyId, ym: data.ym, hiddenEmployeeIds: next }).catch(handleError);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("text-muted-foreground", hidden.length > 0 && "text-foreground")}
        >
          <Users className="mr-1.5 h-4 w-4" />
          {t("reviewPeople", { shown, total: data.employees.length })}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <p className="border-b px-3 py-2 text-xs text-muted-foreground">{t("reviewPeopleHint")}</p>
        <ul className="max-h-80 overflow-y-auto py-1">
          {data.employees.map((e) => (
            <li key={e.id}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/60">
                <Checkbox checked={!e.hidden} onCheckedChange={(v) => toggle(e.id, v === true)} />
                <span className={cn(e.hidden && "text-muted-foreground line-through")}>
                  {e.name}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
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
  const [entries, setEntries] = useState<EntryDraft[]>([]);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data || loaded === data.ym) return;
    const list: EntryDraft[] = data.review.entries.map((e) => ({
      key: e.id,
      id: e.id,
      type: e.type,
      employeeId: e.employeeId ?? undefined,
      text: e.text,
      dueDate: e.dueDate ?? undefined,
      done: e.done,
      fromYm: e.fromYm ?? undefined,
    }));
    // The free text of an older review becomes a note on the next save.
    if (data.review.legacyNotes) {
      list.unshift({ key: newKey(), type: "note", text: data.review.legacyNotes, done: false });
    }
    setEntries(list);
    setDirty(!!data.review.legacyNotes);
    setLoaded(data.ym);
  }, [data, loaded]);

  if (!data || !dashboard) return <PerformanceContentSkeleton />;

  const update = (key: string, patch: Partial<EntryDraft>) => {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
    setDirty(true);
  };
  const add = (type: EntryType) => {
    setEntries((prev) => [...prev, { key: newKey(), type, text: "", done: false }]);
    setDirty(true);
  };
  const removeEntry = (key: string) => {
    setEntries((prev) => prev.filter((e) => e.key !== key));
    setDirty(true);
  };

  async function onSave() {
    if (!dashboard || !data) return;
    setBusy(true);
    try {
      await save({
        companyId: dashboard.companyId,
        ym: data.ym,
        entries: entries.map((e) => ({
          id: e.id as Id<"performanceActions"> | undefined,
          type: e.type,
          employeeId: e.employeeId as Id<"performanceEmployees"> | undefined,
          text: e.text,
          dueDate: e.dueDate,
          done: e.done,
        })),
      });
      setLoaded(null);
      setDirty(false);
      toast.success(t("reviewSaved"));
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  const people = data.employees.filter((e) => !e.hidden);

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
            setDirty(false);
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
        <PeoplePicker data={data} companyId={dashboard.companyId} />
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
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
          <div>
            <CardTitle className="text-base">{t("reviewEntries")}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{t("reviewEntriesHint")}</p>
          </div>
          <div className="flex items-center gap-2">
            {dirty && <span className="text-xs text-warn">{t("unsaved")}</span>}
            <Button size="sm" onClick={() => void onSave()} disabled={busy}>
              <Save className="mr-1.5 h-4 w-4" />
              {t("save")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("reviewNoEntries")}</p>
          )}
          <ul className="divide-y rounded-md border">
            {entries.map((e) => (
              <li key={e.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <Checkbox
                  checked={e.done}
                  onCheckedChange={(v) => update(e.key, { done: v === true })}
                  aria-label={t("done")}
                />
                <Select
                  value={e.type}
                  onValueChange={(v) => update(e.key, { type: v as EntryType })}
                >
                  <SelectTrigger
                    className={cn("h-7 w-36 border-0 text-xs font-medium", TYPE_STYLE[e.type])}
                    aria-label={t("entryTypeLabel")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTRY_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`entryType.${type}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={e.text}
                  onChange={(ev) => update(e.key, { text: ev.target.value })}
                  placeholder={t(`entryPlaceholder.${e.type}`)}
                  className={cn(
                    "h-8 min-w-48 flex-1",
                    e.done && "text-muted-foreground line-through",
                  )}
                />
                {e.fromYm && (
                  <Badge variant="muted" className="text-[10px]">
                    {t("entryFrom", { month: fmtYm(e.fromYm, locale) })}
                  </Badge>
                )}
                <Select
                  value={e.employeeId ?? "team"}
                  onValueChange={(v) => update(e.key, { employeeId: v === "team" ? undefined : v })}
                >
                  <SelectTrigger className="h-8 w-44" aria-label={t("employees")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="team">{t("wholeTeam")}</SelectItem>
                    {people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={e.dueDate ?? ""}
                  onChange={(ev) => update(e.key, { dueDate: ev.target.value || undefined })}
                  className="h-8 w-36"
                  aria-label={t("due")}
                  title={t("due")}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-muted-foreground"
                  onClick={() => removeEntry(e.key)}
                  aria-label={t("delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {ENTRY_TYPES.map((type) => (
              <Button key={type} variant="outline" size="sm" onClick={() => add(type)}>
                <Plus className="mr-1.5 h-4 w-4" />
                {t(`entryType.${type}`)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
