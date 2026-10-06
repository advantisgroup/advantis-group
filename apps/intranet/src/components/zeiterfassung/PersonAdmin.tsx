"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { DEFAULT_MINUTES_PER_WEEKDAY, scheduleOn } from "@advantis/convex/time";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Pencil, Plus, Trash2, UserX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Absences } from "@/components/zeiterfassung/Absences";
import { AuditLog } from "@/components/zeiterfassung/AdminPanel";
import { Entries } from "@/components/zeiterfassung/Entries";
import { FieldLabel, Segmented } from "@/components/zeiterfassung/parts";
import {
  formatDay,
  formatDays,
  formatMinutes,
  useBerlinToday,
  useTimeErrorToast,
} from "@/lib/zeiterfassung";

type Tab = "times" | "absences" | "settings" | "audit";
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** One person, for admins: their times and absences (changes apply
 *  directly), schedule, vacation allowance, opening balance and audit trail. */
export function PersonAdmin({ userId }: { userId: Id<"users"> }) {
  const t = useTranslations("Zeiterfassung");
  const locale = useLocale();
  const today = useBerlinToday();
  const detail = useQuery(api.time.admin.personDetail, { userId, today });
  const [tab, setTab] = useState<Tab>("times");

  if (detail === undefined) return <Skeleton className="h-64 rounded-xl" />;
  if (detail === null) {
    return <EmptyState icon={<UserX />} title={t("admin.personMissing")} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild aria-label={t("admin.back")}>
          <Link href="/zeiterfassung/admin">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{detail.name}</h2>
          <p className="truncate text-sm text-muted-foreground">{detail.email}</p>
        </div>
      </div>
      <KpiStrip>
        <Kpi
          featured
          label={t("overview.balance")}
          value={formatMinutes(detail.balance.minutes, true)}
          hint={
            detail.balance.since
              ? t("admin.balanceSince", {
                  date: formatDay(detail.balance.since, locale, {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  }),
                })
              : t("admin.balanceNoStart")
          }
        />
        <Kpi
          label={t("absences.remaining")}
          value={formatDays(detail.vacation.remaining, locale)}
        />
        <Kpi label={t("absences.taken")} value={formatDays(detail.vacation.taken, locale)} />
        <Kpi
          label={t("admin.weeklyHours")}
          value={formatMinutes(
            scheduleOn(detail.schedules, today).reduce((sum, value) => sum + value, 0),
          )}
        />
      </KpiStrip>
      <Segmented
        value={tab}
        onChange={setTab}
        options={(["times", "absences", "settings", "audit"] as Tab[]).map((value) => ({
          value,
          label: t(`admin.personTab.${value}`),
        }))}
      />
      {tab === "times" && <Entries userId={userId} direct personName={detail.name} />}
      {tab === "absences" && <Absences userId={userId} direct />}
      {tab === "settings" && <Settings detail={detail} />}
      {tab === "audit" && <AuditLog userId={userId} />}
    </div>
  );
}

type Detail = NonNullable<ReturnType<typeof useQuery<typeof api.time.admin.personDetail>>>;

/** On/off switch for people who don't record working time (e.g. the boss). */
function TrackingCard({ detail }: { detail: Detail }) {
  const t = useTranslations("Zeiterfassung");
  const setTracking = useMutation(api.time.admin.setTracking);
  const showError = useTimeErrorToast();
  const [busy, setBusy] = useState(false);

  async function toggle(enabled: boolean) {
    setBusy(true);
    try {
      await setTracking({ userId: detail.userId, disabled: !enabled });
      toast.success(enabled ? t("admin.trackingOnToast") : t("admin.trackingOffToast"));
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-base font-semibold">{t("admin.tracking")}</p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {detail.trackingDisabled ? t("admin.trackingOffHint") : t("admin.trackingOnHint")}
          </p>
        </div>
        <Switch
          checked={!detail.trackingDisabled}
          disabled={busy}
          onCheckedChange={(value) => void toggle(value)}
          aria-label={t("admin.tracking")}
        />
      </CardContent>
    </Card>
  );
}

function Settings({ detail }: { detail: Detail }) {
  const t = useTranslations("Zeiterfassung");
  const locale = useLocale();
  const today = useBerlinToday();
  const removeSchedule = useMutation(api.time.admin.removeSchedule);
  const showError = useTimeErrorToast();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [allowanceYear, setAllowanceYear] = useState<number | null>(null);
  const [openingOpen, setOpeningOpen] = useState(false);
  const year = Number(today.slice(0, 4));
  const years = [...new Set([year, year + 1, ...detail.allowances.map((row) => row.year)])].sort(
    (a, b) => b - a,
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <TrackingCard detail={detail} />
      <Card className="lg:col-span-2">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{t("admin.schedule")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("admin.scheduleHint")}</p>
          </div>
          <Button size="sm" onClick={() => setScheduleOpen(true)}>
            <Plus />
            {t("admin.newSchedule")}
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto pt-0">
          {detail.schedules.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">{t("admin.defaultSchedule")}</p>
          ) : (
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 text-left font-medium">{t("admin.validFrom")}</th>
                  {WEEKDAY_KEYS.map((key) => (
                    <th key={key} className="py-2 text-right font-medium">
                      {t(`weekday.${key}`)}
                    </th>
                  ))}
                  <th className="py-2 text-right font-medium">{t("admin.week")}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {detail.schedules.map((row) => (
                  <tr key={row._id}>
                    <td className="py-2 tabular-nums">
                      {formatDay(row.validFrom, locale, {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                    {row.minutesPerWeekday.map((minutes, index) => (
                      <td
                        key={index}
                        className="py-2 text-right tabular-nums text-muted-foreground"
                      >
                        {minutes ? formatMinutes(minutes) : "–"}
                      </td>
                    ))}
                    <td className="py-2 text-right font-medium tabular-nums">
                      {formatMinutes(row.minutesPerWeekday.reduce((sum, value) => sum + value, 0))}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("entries.delete")}
                        onClick={() =>
                          void removeSchedule({ id: row._id })
                            .then(() => toast.success(t("admin.scheduleRemoved")))
                            .catch(showError)
                        }
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.allowance")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("admin.allowanceHint")}</p>
        </CardHeader>
        <CardContent className="pt-0">
          <ul className="divide-y divide-border/70">
            {years.map((value) => {
              const row = detail.allowances.find((allowance) => allowance.year === value);
              return (
                <li key={value} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="font-medium tabular-nums">{value}</span>
                  <span className="flex-1 text-muted-foreground">
                    {row
                      ? t("admin.allowanceRow", {
                          days: formatDays(row.days, locale),
                          carried: formatDays(row.carriedOver, locale),
                        })
                      : t("admin.allowanceDefault")}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("entries.edit")}
                    onClick={() => setAllowanceYear(value)}
                  >
                    <Pencil />
                  </Button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle className="text-base">{t("admin.opening")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("admin.openingHint")}</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("entries.edit")}
            onClick={() => setOpeningOpen(true)}
          >
            <Pencil />
          </Button>
        </CardHeader>
        <CardContent className="pt-0 text-sm">
          {detail.opening ? (
            <p>
              <span className="font-semibold tabular-nums">
                {formatMinutes(detail.opening.openingMinutes, true)}
              </span>{" "}
              <span className="text-muted-foreground">
                {t("admin.openingFrom", {
                  date: formatDay(detail.opening.openingDate, locale, {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  }),
                })}
              </span>
            </p>
          ) : (
            <p className="text-muted-foreground">{t("admin.noOpening")}</p>
          )}
        </CardContent>
      </Card>

      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        userId={detail.userId}
        current={detail.schedules[0]?.minutesPerWeekday ?? DEFAULT_MINUTES_PER_WEEKDAY}
        today={today}
      />
      <AllowanceDialog
        year={allowanceYear}
        onOpenChange={(open) => !open && setAllowanceYear(null)}
        userId={detail.userId}
        current={detail.allowances.find((row) => row.year === allowanceYear) ?? null}
      />
      <OpeningDialog
        open={openingOpen}
        onOpenChange={setOpeningOpen}
        userId={detail.userId}
        current={detail.opening}
        today={today}
      />
    </div>
  );
}

function hoursText(minutes: number) {
  return String(Math.round((minutes / 60) * 100) / 100).replace(".", ",");
}

function parseHours(value: string): number | null {
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) && number >= 0 && number <= 24 ? Math.round(number * 60) : null;
}

function ScheduleDialog({
  open,
  onOpenChange,
  userId,
  current,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: Id<"users">;
  current: readonly number[];
  today: string;
}) {
  const t = useTranslations("Zeiterfassung");
  const save = useMutation(api.time.admin.setSchedule);
  const showError = useTimeErrorToast();
  const [validFrom, setValidFrom] = useState(today);
  const [hours, setHours] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setValidFrom(today);
    setHours(current.map(hoursText));
  }, [open, current, today]);

  const minutes = hours.map(parseHours);
  const valid = !!validFrom && minutes.length === 7 && minutes.every((value) => value !== null);
  const total = minutes.reduce<number>((sum, value) => sum + (value ?? 0), 0);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("admin.newSchedule")}
      contentClassName="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!valid}
            onClick={() =>
              void save({ userId, validFrom, minutesPerWeekday: minutes as number[] })
                .then(() => {
                  toast.success(t("admin.scheduleSaved"));
                  onOpenChange(false);
                })
                .catch(showError)
            }
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <FieldLabel htmlFor="schedule-from">{t("admin.validFrom")}</FieldLabel>
          <Input
            id="schedule-from"
            type="date"
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
          />
        </div>
        <div>
          <FieldLabel>{t("admin.hoursPerDay")}</FieldLabel>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
            {WEEKDAY_KEYS.map((key, index) => (
              <div key={key}>
                <span className="block text-center text-[10px] text-muted-foreground">
                  {t(`weekday.${key}`)}
                </span>
                <Input
                  inputMode="decimal"
                  value={hours[index] ?? ""}
                  aria-label={t(`weekday.${key}`)}
                  onChange={(event) =>
                    setHours((list) =>
                      list.map((value, i) => (i === index ? event.target.value : value)),
                    )
                  }
                  className="h-8 px-1 text-center text-xs"
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("admin.weeklyTotal", { hours: formatMinutes(total) })}
          </p>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function AllowanceDialog({
  year,
  onOpenChange,
  userId,
  current,
}: {
  year: number | null;
  onOpenChange: (open: boolean) => void;
  userId: Id<"users">;
  current: { days: number; carriedOver: number } | null;
}) {
  const t = useTranslations("Zeiterfassung");
  const save = useMutation(api.time.admin.setAllowance);
  const showError = useTimeErrorToast();
  const [days, setDays] = useState("24");
  const [carried, setCarried] = useState("0");

  useEffect(() => {
    if (year === null) return;
    setDays(String(current?.days ?? 24).replace(".", ","));
    setCarried(String(current?.carriedOver ?? 0).replace(".", ","));
  }, [year, current]);

  const daysValue = Number(days.replace(",", "."));
  const carriedValue = Number(carried.replace(",", "."));
  const valid =
    Number.isFinite(daysValue) &&
    daysValue >= 0 &&
    Number.isFinite(carriedValue) &&
    carriedValue >= 0;

  return (
    <ResponsiveDialog
      open={year !== null}
      onOpenChange={onOpenChange}
      title={t("admin.allowanceTitle", { year: year ?? "" })}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!valid}
            onClick={() =>
              year !== null &&
              void save({ userId, year, days: daysValue, carriedOver: carriedValue })
                .then(() => {
                  toast.success(t("admin.allowanceSaved"));
                  onOpenChange(false);
                })
                .catch(showError)
            }
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="allowance-days">{t("admin.allowanceDays")}</FieldLabel>
          <Input
            id="allowance-days"
            inputMode="decimal"
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
        </div>
        <div>
          <FieldLabel htmlFor="allowance-carried">{t("absences.carriedOver")}</FieldLabel>
          <Input
            id="allowance-carried"
            inputMode="decimal"
            value={carried}
            onChange={(event) => setCarried(event.target.value)}
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function OpeningDialog({
  open,
  onOpenChange,
  userId,
  current,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: Id<"users">;
  current: { openingMinutes: number; openingDate: string } | null;
  today: string;
}) {
  const t = useTranslations("Zeiterfassung");
  const save = useMutation(api.time.admin.setOpeningBalance);
  const showError = useTimeErrorToast();
  const [hours, setHours] = useState("0");
  const [date, setDate] = useState(today);

  useEffect(() => {
    if (!open) return;
    setHours(
      String(Math.round(((current?.openingMinutes ?? 0) / 60) * 100) / 100).replace(".", ","),
    );
    setDate(current?.openingDate ?? today);
  }, [open, current, today]);

  const minutes = Math.round(Number(hours.replace(",", ".").replace("−", "-")) * 60);
  const valid = Number.isFinite(minutes) && !!date;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("admin.opening")}
      description={t("admin.openingHint")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!valid}
            onClick={() =>
              void save({ userId, openingMinutes: minutes, openingDate: date })
                .then(() => {
                  toast.success(t("admin.openingSaved"));
                  onOpenChange(false);
                })
                .catch(showError)
            }
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="opening-hours">{t("admin.openingHours")}</FieldLabel>
          <Input
            id="opening-hours"
            inputMode="decimal"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          />
        </div>
        <div>
          <FieldLabel htmlFor="opening-date">{t("admin.openingDate")}</FieldLabel>
          <Input
            id="opening-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
