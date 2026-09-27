"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { CalendarPlus, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { InfoTip } from "@/components/activity/InfoTip";
import { type TERMIN_ARTEN } from "@/components/applicants/applicant-types";
import { TerminDialog } from "@/components/applicants/EntryDialogs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

import type { FunctionReturnType } from "convex/server";

const ART_COLOR: Record<(typeof TERMIN_ARTEN)[number], string> = {
  telefon: "border-l-info text-info",
  teams: "border-l-primary text-primary",
  vor_ort: "border-l-success text-success",
};

function toISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function calendarDays(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    return {
      iso: toISO(d),
      isToday: i === 0,
      weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
      shortDate: d.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "2-digit",
      }),
    };
  });
}

type Termin = Omit<
  FunctionReturnType<typeof api.hr.applicants.listTermine>[number],
  "applicantName"
>;

export function TerminRow({
  termin,
  applicantName,
  compact,
}: {
  termin: Termin;
  applicantName?: string | null;
  compact?: boolean;
}) {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const confirm = useConfirm();
  const convertTermin = useMutation(api.hr.applicants.convertTermin);
  const removeTermin = useMutation(api.hr.applicants.removeTermin);
  const handleError = useErrorHandler();

  function handleConvert() {
    convertTermin({ terminId: termin._id })
      .then(() => toast.success(t("terminConverted")))
      .catch(handleError);
  }

  async function handleRemove() {
    const ok = await confirm({
      title: t("deleteTermin"),
      description: t("deleteTerminConfirm"),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    removeTermin({ terminId: termin._id }).catch(handleError);
  }

  return (
    <div
      className={cn(
        "space-y-1 rounded-md border border-border/60 border-l-[3px] p-2 text-xs",
        ART_COLOR[termin.art],
        termin.uebernommen && "bg-muted/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <strong className="text-foreground">{termin.uhrzeit || "–"}</strong>
        <span className="rounded-full border px-1.5 py-0.5 font-semibold">
          {t(`terminArt.${termin.art}`)}
        </span>
        {termin.uebernommen && <span className="text-success">✓</span>}
      </div>
      <div className="font-medium text-foreground">
        {applicantName && (
          <Link
            href={`/hr/${termin.applicantId}/uebersicht`}
            className="-m-1.5 rounded p-1.5 text-primary hover:underline"
          >
            {applicantName}
          </Link>
        )}
        {applicantName ? " · " : ""}
        {t(`terminTyp.${termin.typ}`)}
      </div>
      {termin.notiz && <p className="text-muted-foreground">{termin.notiz}</p>}
      {!compact && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!termin.uebernommen && (
            <button
              className="-m-1.5 rounded p-1.5 text-primary hover:underline"
              onClick={() => void handleConvert()}
            >
              {t("markAsHappened")}
            </button>
          )}
          <button
            className="-m-1.5 rounded p-1.5 text-destructive hover:underline"
            onClick={() => void handleRemove()}
          >
            {tc("delete")}
          </button>
          <Link
            href={`/hr/${termin.applicantId}/termine/${termin._id}`}
            className="-m-1.5 ml-auto inline-flex items-center gap-1 rounded p-1.5 text-muted-foreground hover:text-foreground"
          >
            <Link2 className="size-3" />
            {t("openTermin")}
          </Link>
        </div>
      )}
    </div>
  );
}

export function TerminCalendar() {
  const t = useTranslations("Applicants");
  const days = useMemo(() => calendarDays(28), []);
  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return toISO(d);
  }, []);
  const to = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 365);
    return toISO(d);
  }, []);
  const termine = useQuery(api.hr.applicants.listTermine, { from, to });
  const applicants = useQuery(api.hr.applicants.list);
  const [planOpen, setPlanOpen] = useState(false);

  const weeks = [days.slice(0, 7), days.slice(7, 14), days.slice(14, 21), days.slice(21, 28)];
  const rangeStart = days[0].iso;
  const rangeEnd = days[days.length - 1].iso;
  const vergangen = (termine ?? []).filter((tm) => tm.datum < rangeStart && !tm.uebernommen);
  const spaeter = (termine ?? []).filter((tm) => tm.datum > rangeEnd);

  if (!applicants) return null;

  return (
    <div className="space-y-6">
      {applicants.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("noApplicantsYet")}
        </p>
      ) : (
        <div className="flex items-center justify-end gap-1.5">
          <InfoTip text={t("calendarDescription")} />
          <Button size="sm" onClick={() => setPlanOpen(true)}>
            <CalendarPlus className="size-4" />
            {t("planTermin")}
          </Button>
        </div>
      )}

      {/* Desktop: the 4-week grid. */}
      <div className="hidden space-y-6 md:block">
        {weeks.map((week, wi) => {
          const weekTermine = (termine ?? []).filter(
            (tm) => tm.datum >= week[0].iso && tm.datum <= week[6].iso,
          );
          return (
            <div key={wi} className="space-y-2">
              <div className="flex items-baseline gap-2">
                <h3 className="font-display text-sm font-bold">
                  {wi === 0 ? t("thisWeek") : t("weekPlus", { n: wi })}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {week[0].shortDate} – {week[6].shortDate}
                  {weekTermine.length > 0 && ` · ${weekTermine.length}`}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 lg:grid-cols-7">
                {week.map((day) => {
                  const items = (termine ?? []).filter((tm) => tm.datum === day.iso);
                  return (
                    <div
                      key={day.iso}
                      className={cn(
                        "flex min-h-[70px] flex-col overflow-hidden rounded-lg border",
                        day.isToday ? "border-primary" : "border-border/70",
                      )}
                    >
                      <div
                        className={cn(
                          "px-2 py-1 text-xs font-semibold",
                          day.isToday ? "bg-primary text-primary-foreground" : "bg-muted/50",
                        )}
                      >
                        {day.weekday}{" "}
                        <span className="font-normal opacity-80">{day.shortDate}</span>
                      </div>
                      <div className="flex flex-1 flex-col gap-1.5 p-1.5">
                        {items.length === 0 ? (
                          <span className="text-[11px] text-muted-foreground">–</span>
                        ) : (
                          items.map((tm) => (
                            <TerminRow
                              key={tm._id}
                              termin={tm}
                              applicantName={tm.applicantName}
                              compact
                            />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile: an agenda of only the days that actually have Termine —
          a phone screen full of empty grid boxes helps no one. */}
      <div className="space-y-4 md:hidden">
        {days.filter((day) => (termine ?? []).some((tm) => tm.datum === day.iso)).length === 0 ? (
          <EmptyState icon={<CalendarPlus />} title={t("noTermineInWindow")} />
        ) : (
          days.map((day) => {
            const items = (termine ?? []).filter((tm) => tm.datum === day.iso);
            if (items.length === 0) return null;
            return (
              <div key={day.iso} className="space-y-1.5">
                <p
                  className={cn(
                    "text-xs font-semibold uppercase tracking-wide",
                    day.isToday ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {day.weekday} {day.shortDate}
                  {day.isToday && ` · ${t("today")}`}
                </p>
                {items.map((tm) => (
                  <TerminRow key={tm._id} termin={tm} applicantName={tm.applicantName} />
                ))}
              </div>
            );
          })
        )}
      </div>

      {vergangen.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-semibold">
              {t("pastTermineWithoutContact", { count: vergangen.length })}
            </p>
            {vergangen.map((tm) => (
              <TerminRow key={tm._id} termin={tm} applicantName={tm.applicantName} />
            ))}
          </CardContent>
        </Card>
      )}

      {spaeter.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-semibold">{t("futureTermine", { count: spaeter.length })}</p>
            {spaeter.map((tm) => (
              <TerminRow key={tm._id} termin={tm} applicantName={tm.applicantName} />
            ))}
          </CardContent>
        </Card>
      )}

      <TerminDialog open={planOpen} onOpenChange={setPlanOpen} applicants={applicants} />
    </div>
  );
}
