"use client";

import { useMemo, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import {
  addDays,
  type ClockodoExport,
  type ImportPlan,
  matchIntranetUser,
  type PersonPlan,
  planClockodoImport,
} from "@advantis/convex/time";
import { useMutation, useQuery } from "convex/react";
import { CircleCheck, FileUp, TriangleAlert, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip } from "@/components/zeiterfassung/parts";
import { cn } from "@/lib/utils";
import { formatDay, formatDays, formatMinutes, useTimeErrorToast } from "@/lib/zeiterfassung";

const BATCH = 400;
const NONE = "__none__";

interface Row {
  plan: PersonPlan;
  userId: Id<"users"> | null;
  include: boolean;
  takeBalance: boolean;
}

/** Sum of the current weekly model in minutes. */
function weeklyMinutes(plan: PersonPlan, on: string): number | null {
  const current = plan.schedules.filter((row) => row.validFrom <= on).at(-1);
  return current ? current.minutesPerWeekday.reduce((sum, value) => sum + value, 0) : null;
}

/**
 * Verwaltung → Import: read the Clockodo export, check who maps to whom and
 * whose hours account is worth taking over, then write it in batches. Safe to
 * run again with a newer export (rows are keyed by their Clockodo id).
 */
export function ClockodoImport() {
  const t = useTranslations("Zeiterfassung.import");
  const locale = useLocale();
  const confirm = useConfirm();
  const showError = useTimeErrorToast();
  const candidates = useQuery(api.time.importClockodo.candidates);
  const applyPerson = useMutation(api.time.importClockodo.applyPerson);
  const importEntries = useMutation(api.time.importClockodo.importEntries);
  const importAbsences = useMutation(api.time.importClockodo.importAbsences);
  const recompute = useMutation(api.time.admin.recomputeTotals);
  const fileInput = useRef<HTMLInputElement>(null);

  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);

  async function readFile(file: File) {
    try {
      const data = JSON.parse(await file.text()) as ClockodoExport;
      if (!Array.isArray(data.users) || !Array.isArray(data.entries)) throw new Error("shape");
      const next = planClockodoImport(data);
      const recent = addDays(next.exportDate, -14);
      setPlan(next);
      setDone([]);
      setRows(
        next.people.map((person) => {
          const match = candidates ? matchIntranetUser(person, candidates) : null;
          const clocksNow = person.lastEntryDate !== null && person.lastEntryDate >= recent;
          return {
            plan: person,
            userId: (match?.userId as Id<"users"> | undefined) ?? null,
            include: Boolean(match) && (person.active || person.entries.length > 0),
            takeBalance: person.balanceMinutes !== null && clocksNow,
          };
        }),
      );
    } catch {
      toast.error(t("badFile"));
    }
  }

  const chosen = rows.filter((row) => row.include && row.userId);
  const duplicate = useMemo(() => {
    const seen = new Set<string>();
    for (const row of chosen) {
      if (seen.has(row.userId!)) return true;
      seen.add(row.userId!);
    }
    return false;
  }, [chosen]);

  function update(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function run() {
    if (!plan || chosen.length === 0 || duplicate) return;
    const ok = await confirm({
      title: t("confirmTitle", { count: chosen.length }),
      description: t("confirmDescription"),
      confirmLabel: t("start"),
      destructive: false,
    });
    if (!ok) return;
    const finished: string[] = [];
    try {
      for (const [index, row] of chosen.entries()) {
        const person = row.plan;
        const userId = row.userId!;
        setProgress(t("progress", { index: index + 1, count: chosen.length, name: person.name }));
        await applyPerson({
          userId,
          clockodoId: person.clockodoId,
          schedules: person.schedules,
          allowance: person.allowance ?? undefined,
          opening: {
            minutes: row.takeBalance ? (person.balanceMinutes ?? 0) : 0,
            date: plan.exportDate,
          },
        });
        for (let i = 0; i < person.entries.length; i += BATCH) {
          await importEntries({ userId, entries: person.entries.slice(i, i + BATCH) });
        }
        for (let i = 0; i < person.absences.length; i += BATCH) {
          await importAbsences({ userId, absences: person.absences.slice(i, i + BATCH) });
        }
        const from = [plan.exportDate, ...person.schedules.map((s) => s.validFrom)].sort()[0];
        await recompute({ userId, from });
        finished.push(person.name);
        setDone([...finished]);
      }
      toast.success(t("finished", { count: finished.length }));
    } catch (error) {
      showError(error);
    } finally {
      setProgress(null);
    }
  }

  if (candidates === undefined) return <Skeleton className="h-40 rounded-xl" />;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/70 bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h3 className="text-base font-semibold">{t("title")}</h3>
            <p className="max-w-2xl text-sm text-muted-foreground">{t("intro")}</p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
              event.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => fileInput.current?.click()} className="shrink-0">
            <FileUp />
            {plan ? t("otherFile") : t("chooseFile")}
          </Button>
        </div>
        {plan && (
          <p className="mt-4 text-sm">
            {t("summary", {
              date: formatDay(plan.exportDate, locale, {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              }),
              people: plan.people.length,
              entries: plan.people.reduce((sum, p) => sum + p.entries.length, 0),
              absences: plan.people.reduce((sum, p) => sum + p.absences.length, 0),
            })}
          </p>
        )}
      </div>

      {plan && (
        <>
          <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2 font-medium">{t("col.clockodo")}</th>
                  <th className="px-3 py-2 font-medium">{t("col.intranet")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("col.week")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("col.vacation")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("col.balance")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("col.data")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((row, index) => {
                  const person = row.plan;
                  const week = weeklyMinutes(person, plan.exportDate);
                  const isDone = done.includes(person.name);
                  return (
                    <tr
                      key={person.clockodoId}
                      className={cn("align-top", !row.include && "text-muted-foreground")}
                    >
                      <td className="px-3 py-3">
                        {isDone ? (
                          <CircleCheck className="size-4 text-ok" />
                        ) : (
                          <Checkbox
                            checked={row.include}
                            disabled={!row.userId || progress !== null}
                            onCheckedChange={(value) => update(index, { include: value === true })}
                            aria-label={t("include", { name: person.name })}
                          />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-foreground">{person.name}</span>
                          {!person.active && <Chip>{t("inactive")}</Chip>}
                        </div>
                        <div className="text-xs text-muted-foreground">{person.email}</div>
                        {person.warnings.map((warning) => (
                          <div
                            key={warning}
                            className="mt-1 flex items-start gap-1 text-xs text-warn"
                          >
                            <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                            {warning}
                          </div>
                        ))}
                      </td>
                      <td className="px-3 py-3">
                        <Select
                          value={row.userId ?? NONE}
                          disabled={progress !== null}
                          onValueChange={(value) =>
                            update(index, {
                              userId: value === NONE ? null : (value as Id<"users">),
                              include: value !== NONE,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-56">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>{t("notImported")}</SelectItem>
                            {candidates.map((user) => (
                              <SelectItem key={user.userId} value={user.userId}>
                                {user.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {week === null ? "–" : formatMinutes(week)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {person.allowance
                          ? formatDays(person.allowance.days + person.allowance.carriedOver, locale)
                          : "–"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {person.balanceMinutes === null ? (
                          "–"
                        ) : (
                          <label className="inline-flex items-center justify-end gap-2">
                            <span
                              className={cn(
                                "tabular-nums",
                                !row.takeBalance && "text-muted-foreground line-through",
                              )}
                            >
                              {formatMinutes(person.balanceMinutes, true)}
                            </span>
                            <Checkbox
                              checked={row.takeBalance}
                              disabled={progress !== null}
                              onCheckedChange={(value) =>
                                update(index, { takeBalance: value === true })
                              }
                              aria-label={t("takeBalance", { name: person.name })}
                            />
                          </label>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-muted-foreground">
                        <div>{t("entries", { count: person.entries.length })}</div>
                        <div>{t("absences", { count: person.absences.length })}</div>
                        {person.lastEntryDate && (
                          <div>
                            {t("lastEntry", {
                              date: formatDay(person.lastEntryDate, locale, {
                                day: "2-digit",
                                month: "2-digit",
                                year: "2-digit",
                              }),
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {duplicate
                ? t("duplicate")
                : (progress ??
                  t("balanceHint", {
                    date: formatDay(plan.exportDate, locale, { day: "2-digit", month: "2-digit" }),
                  }))}
            </p>
            <Button
              onClick={() => void run()}
              disabled={chosen.length === 0 || duplicate || progress !== null}
              className="shrink-0"
            >
              <Upload />
              {t("startCount", { count: chosen.length })}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
