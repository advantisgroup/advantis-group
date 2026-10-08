"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Plane, Plus, Thermometer, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { AbsenceOverlaps } from "@/components/zeiterfassung/Overlaps";
import {
  ABSENCE_TYPES,
  AbsenceStatusBadge,
  AbsenceTypeLabel,
  FieldLabel,
} from "@/components/zeiterfassung/parts";
import {
  type AbsenceType,
  formatDay,
  formatDays,
  useBerlinToday,
  useTimeErrorToast,
  useTimeMode,
} from "@/lib/zeiterfassung";

/** Your absences: the vacation account, requests and sick days. */
export function Absences({ userId, direct }: { userId?: Id<"users">; direct: boolean }) {
  const t = useTranslations("Zeiterfassung");
  const locale = useLocale();
  const today = useBerlinToday();
  const rows = useQuery(api.time.absences.list, { userId });
  const summary = useQuery(api.time.overview.summary, { userId, today });
  const cancel = useMutation(api.time.absences.cancel);
  const { readOnly } = useTimeMode();
  const showError = useTimeErrorToast();
  const [dialog, setDialog] = useState<AbsenceType | null>(null);

  const range = (startDate: string, endDate: string) =>
    startDate === endDate
      ? formatDay(startDate, locale, {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : `${formatDay(startDate, locale, { day: "2-digit", month: "2-digit" })} – ${formatDay(
          endDate,
          locale,
          {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          },
        )}`;

  async function withdraw(id: Id<"timeAbsences">) {
    try {
      await cancel({ id });
      toast.success(t("absences.cancelled"));
    } catch (error) {
      showError(error);
    }
  }

  const vacation = summary?.vacation;

  return (
    <div className="space-y-5">
      <KpiStrip>
        <Kpi
          featured
          label={t("absences.remaining")}
          value={vacation ? formatDays(vacation.remaining, locale) : "–"}
          hint={
            vacation && vacation.pending > 0
              ? t("absences.afterPending", {
                  days: formatDays(vacation.remainingAfterPending, locale),
                })
              : undefined
          }
        />
        <Kpi
          label={t("absences.entitlement", { year: today.slice(0, 4) })}
          value={vacation ? formatDays(vacation.entitlement, locale) : "–"}
        />
        <Kpi
          label={t("absences.carriedOver")}
          value={vacation ? formatDays(vacation.carriedOver, locale) : "–"}
          hint={
            vacation && vacation.carriedOver > 0
              ? vacation.carriedOverExpired > 0
                ? t("absences.carriedOverExpired", {
                    days: formatDays(vacation.carriedOverExpired, locale),
                  })
                : t("absences.carriedOverUntil", {
                    date: formatDay(vacation.carriedOverExpires, locale, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    }),
                  })
              : undefined
          }
        />
        <Kpi
          label={t("absences.taken")}
          value={vacation ? formatDays(vacation.taken, locale) : "–"}
          hint={t("absences.takenHint")}
        />
      </KpiStrip>

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setDialog("sick")}>
            <Thermometer />
            {t("absences.reportSick")}
          </Button>
          <Button size="sm" onClick={() => setDialog("vacation")}>
            <Plus />
            {t("absences.request")}
          </Button>
        </div>
      )}

      {rows === undefined ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Plane />}
          title={t("absences.empty")}
          description={t("absences.emptyHint")}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("absences.type")}</TableHead>
                <TableHead className="w-64">{t("absences.period")}</TableHead>
                <TableHead className="w-20 text-right">{t("absences.days")}</TableHead>
                <TableHead className="w-32">{t("absences.status")}</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row._id} className="hover:bg-transparent">
                  <TableCell className="w-full max-w-0">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="shrink-0 font-medium">
                        <AbsenceTypeLabel type={row.type} />
                      </span>
                      {(row.note || row.decisionNote) && (
                        <span className="truncate text-muted-foreground">
                          {[row.note, row.decisionNote].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {range(row.startDate, row.endDate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatDays(row.days, locale)}
                  </TableCell>
                  <TableCell>
                    <AbsenceStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {!readOnly &&
                      (row.status === "pending" || (direct && row.status === "approved")) && (
                        <Button variant="ghost" size="sm" onClick={() => void withdraw(row._id)}>
                          <X />
                          {t("absences.cancel")}
                        </Button>
                      )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ul className="divide-y divide-border/60 md:hidden">
            {rows.map((row) => (
              <li key={row._id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block text-sm font-medium">
                    <AbsenceTypeLabel type={row.type} />
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {range(row.startDate, row.endDate)} ·{" "}
                    {t("absences.daysLabel", { count: row.days })}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <AbsenceStatusBadge status={row.status} />
                  {!readOnly && row.status === "pending" && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() => void withdraw(row._id)}
                    >
                      {t("absences.cancel")}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <AbsenceDialog
        type={dialog}
        onOpenChange={(value) => !value && setDialog(null)}
        userId={userId}
        direct={direct}
        today={today}
      />
    </div>
  );
}

function AbsenceDialog({
  type: initialType,
  onOpenChange,
  userId,
  direct,
  today,
}: {
  type: AbsenceType | null;
  onOpenChange: (open: boolean) => void;
  userId?: Id<"users">;
  direct: boolean;
  today: string;
}) {
  const t = useTranslations("Zeiterfassung");
  const request = useMutation(api.time.absences.request);
  const showError = useTimeErrorToast();
  const [type, setType] = useState<AbsenceType>("vacation");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [halfDayStart, setHalfDayStart] = useState(false);
  const [halfDayEnd, setHalfDayEnd] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!initialType) return;
    setType(initialType);
    setStartDate(today);
    setEndDate(today);
    setHalfDayStart(false);
    setHalfDayEnd(false);
    setNote("");
  }, [initialType, today]);

  const single = startDate === endDate;
  const valid = !!startDate && !!endDate && endDate >= startDate;
  const instant = type === "sick" || direct;
  const overlaps = useQuery(
    api.time.absences.overlaps,
    initialType !== null && valid && type !== "sick"
      ? { from: startDate, to: endDate, userId }
      : "skip",
  );

  async function submit() {
    if (!valid) return;
    setSaving(true);
    try {
      await request({
        userId,
        type,
        startDate,
        endDate,
        halfDayStart,
        halfDayEnd: single ? false : halfDayEnd,
        note: note.trim() || undefined,
      });
      toast.success(instant ? t("absences.saved") : t("absences.requested"));
      onOpenChange(false);
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      open={initialType !== null}
      onOpenChange={onOpenChange}
      title={type === "sick" ? t("absences.reportSick") : t("absences.request")}
      contentClassName="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!valid || saving}>
            {instant ? t("common.save") : t("absences.send")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>{t("absences.type")}</FieldLabel>
          <Select value={type} onValueChange={(value) => setType(value as AbsenceType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ABSENCE_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`absenceType.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="absence-start">{t("absences.from")}</FieldLabel>
            <Input
              id="absence-start"
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                if (event.target.value > endDate) setEndDate(event.target.value);
              }}
            />
          </div>
          <div>
            <FieldLabel htmlFor="absence-end">{t("absences.to")}</FieldLabel>
            <Input
              id="absence-end"
              type="date"
              value={endDate}
              min={startDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={halfDayStart}
              onCheckedChange={(value) => setHalfDayStart(value === true)}
            />
            {single ? t("absences.halfDay") : t("absences.halfDayStart")}
          </label>
          {!single && (
            <label className="flex items-center gap-2">
              <Checkbox
                checked={halfDayEnd}
                onCheckedChange={(value) => setHalfDayEnd(value === true)}
              />
              {t("absences.halfDayEnd")}
            </label>
          )}
        </div>
        {type !== "sick" && valid && <AbsenceOverlaps rows={overlaps} />}
        <div>
          <FieldLabel htmlFor="absence-note">{t("absences.note")}</FieldLabel>
          <Textarea
            id="absence-note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <Alert>
          <AlertDescription>
            {type === "sick"
              ? t("absences.sickHint")
              : direct
                ? t("absences.directHint")
                : t("absences.approvalHint")}
          </AlertDescription>
        </Alert>
      </div>
    </ResponsiveDialog>
  );
}
