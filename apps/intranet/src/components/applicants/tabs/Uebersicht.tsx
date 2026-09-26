"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { matchSkills } from "@advantis/types";
import { useMutation, useQuery } from "convex/react";
import { Briefcase, Calendar, Check, Printer, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  type ApplicantDetail,
  ensureRichHtml,
  today,
} from "@/components/applicants/applicant-types";
import { buildTimeline } from "@/components/applicants/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Rich-text field for the long-form fields (summary, experience,
 * education) where a single flat line can't hold real detail. Saves on
 * blur, same as every editable field on this page. */
function RichField({
  label,
  html,
  placeholder,
  onSave,
}: {
  label: string;
  html: string;
  placeholder?: string;
  onSave: (html: string) => void;
}) {
  const [value, setValue] = useState(() => ensureRichHtml(html));
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <RichTextEditor
        value={value}
        onChange={setValue}
        onBlur={() => value !== ensureRichHtml(html) && onSave(value)}
        placeholder={placeholder}
        minHeight="min-h-24"
      />
    </div>
  );
}

export function Uebersicht({
  applicant,
  highlight,
}: {
  applicant: ApplicantDetail;
  highlight: string[];
}) {
  const t = useTranslations("Applicants");
  const locale = useLocale();
  const profiles = useQuery(api.hr.applicants.listProfiles);
  const update = useMutation(api.hr.applicants.update);
  const setPoolConsent = useMutation(api.hr.retention.setPoolConsent);
  const handleError = useErrorHandler();
  const isHighlighted = (skill: string) =>
    highlight.some((h) => h.toLowerCase() === skill.toLowerCase());

  const profile = profiles?.find((p) => p._id === applicant.profilId) ?? null;
  const matched = profile ? matchSkills(profile.skills, applicant) : [];
  const missing = profile ? profile.skills.filter((s) => !matched.includes(s)) : [];
  const matchPct =
    profile && profile.skills.length > 0
      ? Math.round((matched.length / profile.skills.length) * 100)
      : 0;

  const timeline = useMemo(
    () => buildTimeline(applicant, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applicant],
  );
  const latestTouchpoint = timeline[0] ?? null;
  const nextAppointment = [...applicant.termine]
    .filter((termin) => !termin.uebernommen && termin.datum >= today())
    .sort((a, b) => (a.datum + a.uhrzeit).localeCompare(b.datum + b.uhrzeit))[0];

  function patch(fields: Parameters<typeof update>[0]) {
    update(fields).catch(handleError);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Briefcase className="size-3.5" />
              {t("appliedFor")}
            </span>
            <Input
              className="mt-1.5 text-base font-medium"
              defaultValue={applicant.position ?? ""}
              placeholder={t("positionUnknown")}
              onBlur={(e) => {
                if (e.target.value !== (applicant.position ?? "")) {
                  patch({
                    applicantId: applicant._id,
                    position: e.target.value,
                  });
                }
              }}
            />
          </div>

          <div className="space-y-2 border-t border-border/60 pt-4">
            <p className="text-sm font-semibold">{t("skillMatch")}</p>
            {!profiles || profiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noProfilesYet")}</p>
            ) : (
              <>
                <Select
                  value={applicant.profilId ?? "none"}
                  onValueChange={(v) =>
                    patch({
                      applicantId: applicant._id,
                      profilId: v === "none" ? null : (v as Id<"applicantSkillProfiles">),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("noProfileAssigned")}</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p._id} value={p._id}>
                        {p.name} ({p.skills.length})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {profile && profile.skills.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-[width]",
                            matchPct === 100 ? "bg-success" : "bg-primary",
                          )}
                          style={{ width: `${matchPct}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                        {matched.length}/{profile.skills.length}
                      </span>
                    </div>
                    <div className="space-y-1 text-sm">
                      {matched.map((s) => (
                        <div
                          key={s}
                          className={cn(
                            "flex items-center gap-2 rounded px-1 -mx-1",
                            isHighlighted(s) && "deeplink-hl",
                          )}
                        >
                          <Check className="size-3.5 shrink-0 text-success" />
                          {s}
                        </div>
                      ))}
                      {missing.map((s) => (
                        <div key={s} className="flex items-center gap-2 text-muted-foreground">
                          <X className="size-3.5 shrink-0 text-destructive" />
                          {s}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {applicant.skills.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("skillsFromDocuments")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {applicant.skills.map((s) => (
                    <Badge
                      key={s}
                      variant="muted"
                      className={cn(isHighlighted(s) && "deeplink-hl")}
                    >
                      {s}
                    </Badge>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t("poolConsent")}</p>
              <p className="text-[12.5px] text-muted-foreground">
                {applicant.poolConsentUntil
                  ? t("poolConsentUntil", {
                      date: formatIsoDate(
                        new Date(applicant.poolConsentUntil).toISOString().slice(0, 10),
                        locale,
                      ),
                    })
                  : t("poolConsentNone")}
              </p>
            </div>
            <Select
              value=""
              onValueChange={(value) =>
                setPoolConsent({ applicantId: applicant._id, months: Number(value) }).catch(
                  handleError,
                )
              }
            >
              <SelectTrigger className="w-auto">
                <SelectValue placeholder={t("poolConsentRecord")} />
              </SelectTrigger>
              <SelectContent>
                {[6, 12, 24].map((months) => (
                  <SelectItem key={months} value={String(months)}>
                    {t("poolConsentMonths", { months })}
                  </SelectItem>
                ))}
                {applicant.poolConsentUntil && (
                  <SelectItem value="0">{t("poolConsentWithdraw")}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3 border-t border-border/60 pt-4">
            <p className="text-sm font-semibold">{t("profileFromDocuments")}</p>
            <RichField
              label={t("summary")}
              html={applicant.zusammenfassung ?? ""}
              placeholder={t("richFieldPlaceholder")}
              onSave={(v) => patch({ applicantId: applicant._id, zusammenfassung: v })}
            />
            <RichField
              label={t("experience")}
              html={applicant.berufserfahrung ?? ""}
              placeholder={t("richFieldPlaceholder")}
              onSave={(v) => patch({ applicantId: applicant._id, berufserfahrung: v })}
            />
            <RichField
              label={t("education")}
              html={applicant.ausbildung ?? ""}
              placeholder={t("richFieldPlaceholder")}
              onSave={(v) => patch({ applicantId: applicant._id, ausbildung: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="mb-3 text-sm font-semibold">{t("timeline")}</p>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("timelineEmpty")}</p>
          ) : (
            <ol className="relative space-y-4 border-l border-border/70 pl-6">
              {timeline.map((entry) => (
                <li key={entry.id} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[calc(1.5rem+5px)] top-0.5 flex size-6 items-center justify-center rounded-full ring-4 ring-background",
                      entry.upcoming
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <entry.icon className="size-3.5" />
                  </span>
                  <Link
                    href={entry.href}
                    className="-mx-2 -my-1 block rounded-lg px-2 py-1 text-sm transition-colors hover:bg-accent/40"
                  >
                    <p className="flex flex-wrap items-center gap-1.5 font-medium">
                      {entry.label}
                      {entry.upcoming && (
                        <Badge variant="outline" className="text-[10px]">
                          {t("upcoming")}
                        </Badge>
                      )}
                    </p>
                    <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="size-3" />
                      {formatIsoDate(entry.date, locale)}
                      {entry.time ? ` · ${entry.time}` : ""}
                    </p>
                    {entry.notiz && (
                      <p className="mt-0.5 line-clamp-2 text-muted-foreground">{entry.notiz}</p>
                    )}
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/25 bg-primary/[0.03]">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col items-stretch gap-3 border-b border-border/70 pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("handoffBrief")}
              </p>
              <h2 className="mt-1 text-xl font-semibold">{applicant.name}</h2>
              <p className="text-sm text-muted-foreground">
                {applicant.position || t("positionUnknown")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => window.print()}
            >
              <Printer className="size-3.5" />
              {t("printHandoffBrief")}
            </Button>
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <BriefRow
              label={t("handoffStatus")}
              value={t(`status${applicant.status === "neu" ? "Neu" : "Pool"}`)}
            />
            <BriefRow label={t("documentsInFile")} value={String(applicant.documents.length)} />
            <BriefRow label={t("email")} value={applicant.email ?? "—"} />
            <BriefRow label={t("phone")} value={applicant.telefon ?? "—"} />
            <BriefRow
              label={t("handoffLatestTouchpoint")}
              value={
                latestTouchpoint
                  ? `${latestTouchpoint.label} · ${formatIsoDate(latestTouchpoint.date, locale)}`
                  : t("handoffNoActivity")
              }
            />
            <BriefRow
              label={t("handoffNextStep")}
              value={
                nextAppointment
                  ? `${t(`terminTyp.${nextAppointment.typ}`)} · ${formatIsoDate(nextAppointment.datum, locale)}${nextAppointment.uhrzeit ? ` · ${nextAppointment.uhrzeit}` : ""}`
                  : t("noUpcomingTermine")
              }
            />
          </div>

          {latestTouchpoint?.notiz && (
            <div className="border-t border-border/70 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("handoffLatestNote")}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{latestTouchpoint.notiz}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BriefRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 break-words font-medium">{value}</p>
    </div>
  );
}
