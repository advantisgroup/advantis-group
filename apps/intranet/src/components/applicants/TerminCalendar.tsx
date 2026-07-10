"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

import type { FunctionReturnType } from "convex/server";

const TERMIN_ARTEN = ["telefon", "teams", "vor_ort"] as const;
const TERMIN_TYPEN = ["interview", "gespraech", "probetag", "sonstiges"] as const;

const ART_COLOR: Record<(typeof TERMIN_ARTEN)[number], string> = {
  telefon: "border-l-info text-info",
  teams: "border-l-primary text-primary",
  vor_ort: "border-l-success text-success",
};

function toISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function today(): string {
  return toISO(new Date());
}

function calendarDays(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    return {
      iso: toISO(d),
      isToday: i === 0,
      weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
      shortDate: d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" }),
    };
  });
}

type Termin = Omit<FunctionReturnType<typeof api.applicants.listTermine>[number], "applicantName">;
type Applicant = FunctionReturnType<typeof api.applicants.list>[number];

export function TerminForm({
  applicants,
  fixedApplicantId,
}: {
  applicants: Applicant[];
  fixedApplicantId?: Id<"applicants">;
}) {
  const t = useTranslations("Applicants");
  const createTermin = useMutation(api.applicants.createTermin);
  const handleError = useErrorHandler();

  const [applicantId, setApplicantId] = useState<string>(fixedApplicantId ?? "");
  const [datum, setDatum] = useState(today());
  const [uhrzeit, setUhrzeit] = useState("10:00");
  const [art, setArt] = useState<(typeof TERMIN_ARTEN)[number]>("telefon");
  const [typ, setTyp] = useState<(typeof TERMIN_TYPEN)[number]>("interview");
  const [notiz, setNotiz] = useState("");

  function save() {
    if (!applicantId) {
      toast.error(t("selectApplicantFirst"));
      return;
    }
    createTermin({
      applicantId: applicantId as Id<"applicants">,
      datum,
      uhrzeit,
      art,
      typ,
      notiz: notiz.trim() || undefined,
    })
      .then(() => {
        toast.success(t("terminSaved"));
        setNotiz("");
      })
      .catch(handleError);
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <p className="text-sm font-semibold">{t("planTermin")}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {!fixedApplicantId && (
            <Select value={applicantId} onValueChange={setApplicantId}>
              <SelectTrigger className="col-span-2 sm:col-span-3 lg:col-span-1">
                <SelectValue placeholder={t("chooseApplicant")} />
              </SelectTrigger>
              <SelectContent>
                {applicants.map(a => (
                  <SelectItem key={a._id} value={a._id}>
                    {a.name}
                    {a.position ? ` (${a.position})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input type="date" value={datum} onChange={e => setDatum(e.target.value)} />
          <Input type="time" value={uhrzeit} onChange={e => setUhrzeit(e.target.value)} />
          <Select value={art} onValueChange={v => setArt(v as typeof art)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMIN_ARTEN.map(a => (
                <SelectItem key={a} value={a}>
                  {t(`terminArt.${a}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typ} onValueChange={v => setTyp(v as typeof typ)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMIN_TYPEN.map(ty => (
                <SelectItem key={ty} value={ty}>
                  {t(`terminTyp.${ty}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder={t("terminNotePlaceholder")}
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
          />
          <Button onClick={save}>{t("saveTermin")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

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
  const router = useRouter();
  const confirm = useConfirm();
  const convertTermin = useMutation(api.applicants.convertTermin);
  const removeTermin = useMutation(api.applicants.removeTermin);
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
        termin.uebernommen && "bg-muted/40"
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
          <button
            type="button"
            onClick={() => router.push(`/applicants/${termin.applicantId}`)}
            className="text-primary hover:underline"
          >
            {applicantName}
          </button>
        )}
        {applicantName ? " · " : ""}
        {t(`terminTyp.${termin.typ}`)}
      </div>
      {termin.notiz && <p className="text-muted-foreground">{termin.notiz}</p>}
      {!compact && (
        <div className="flex flex-wrap gap-2 pt-1">
          {!termin.uebernommen && (
            <button
              className="text-primary hover:underline"
              onClick={() => void handleConvert()}
            >
              {t("markAsHappened")}
            </button>
          )}
          <button
            className="text-destructive hover:underline"
            onClick={() => void handleRemove()}
          >
            {tc("delete")}
          </button>
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
  const termine = useQuery(api.applicants.listTermine, { from, to });
  const applicants = useQuery(api.applicants.list);

  const weeks = [days.slice(0, 7), days.slice(7, 14), days.slice(14, 21), days.slice(21, 28)];
  const rangeStart = days[0].iso;
  const rangeEnd = days[days.length - 1].iso;
  const vergangen = (termine ?? []).filter(
    tm => tm.datum < rangeStart && !tm.uebernommen
  );
  const spaeter = (termine ?? []).filter(tm => tm.datum > rangeEnd);

  if (!applicants) return null;

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-muted-foreground">
        {t("calendarDescription")}
      </p>
      {applicants.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("noApplicantsYet")}
        </p>
      ) : (
        <TerminForm applicants={applicants} />
      )}

      {weeks.map((week, wi) => {
        const weekTermine = (termine ?? []).filter(
          tm => tm.datum >= week[0].iso && tm.datum <= week[6].iso
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {week.map(day => {
                const items = (termine ?? []).filter(tm => tm.datum === day.iso);
                return (
                  <div
                    key={day.iso}
                    className={cn(
                      "flex min-h-[70px] flex-col overflow-hidden rounded-lg border",
                      day.isToday ? "border-primary" : "border-border/70"
                    )}
                  >
                    <div
                      className={cn(
                        "px-2 py-1 text-xs font-semibold",
                        day.isToday ? "bg-primary text-primary-foreground" : "bg-muted/50"
                      )}
                    >
                      {day.weekday} <span className="font-normal opacity-80">{day.shortDate}</span>
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5 p-1.5">
                      {items.length === 0 ? (
                        <span className="text-[11px] text-muted-foreground">–</span>
                      ) : (
                        items.map(tm => (
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

      {vergangen.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-semibold">
              {t("pastTermineWithoutContact", { count: vergangen.length })}
            </p>
            {vergangen.map(tm => (
              <TerminRow key={tm._id} termin={tm} applicantName={tm.applicantName} />
            ))}
          </CardContent>
        </Card>
      )}

      {spaeter.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-semibold">
              {t("futureTermine", { count: spaeter.length })}
            </p>
            {spaeter.map(tm => (
              <TerminRow key={tm._id} termin={tm} applicantName={tm.applicantName} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
