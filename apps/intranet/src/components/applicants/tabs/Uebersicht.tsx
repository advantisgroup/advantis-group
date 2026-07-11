"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { matchSkills } from "@advantis/types";
import { useMutation, useQuery } from "convex/react";
import { Briefcase, CalendarClock, Mail, PhoneCall, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { LucideIcon } from "lucide-react";

function Field({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
}) {
  const [v, setV] = useState(value);
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Input
        value={v}
        onChange={e => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
      />
    </label>
  );
}

interface TimelineEntry {
  id: string;
  date: string;
  time?: string;
  icon: LucideIcon;
  label: string;
  notiz?: string;
  href: string;
  upcoming: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildTimeline(
  applicant: ApplicantDetail,
  t: ReturnType<typeof useTranslations>
): TimelineEntry[] {
  const now = today();
  const entries: TimelineEntry[] = [
    ...applicant.termine.map(tm => ({
      id: `termin:${tm._id}`,
      date: tm.datum,
      time: tm.uhrzeit,
      icon: CalendarClock,
      label: `${t(`terminTyp.${tm.typ}`)} · ${t(`terminArt.${tm.art}`)}`,
      notiz: tm.notiz,
      href: `/applicants/${applicant._id}/termine/${tm._id}`,
      upcoming: !tm.uebernommen && tm.datum >= now,
    })),
    ...applicant.kontakte.map(k => ({
      id: `kontakt:${k._id}`,
      date: k.datum,
      icon: PhoneCall,
      label: t(`kontaktArt.${k.art}`),
      notiz: k.notiz,
      href: `/applicants/${applicant._id}/kontakte/${k._id}`,
      upcoming: false,
    })),
    ...applicant.emails.map(m => ({
      id: `email:${m._id}`,
      date: m.datum,
      icon: Mail,
      label: t(`emailKategorie.${m.kategorie}`),
      notiz: m.notiz,
      href: `/applicants/${applicant._id}/emails/${m._id}`,
      upcoming: false,
    })),
    ...applicant.interviews.map(iv => ({
      id: `interview:${iv._id}`,
      date: iv.datum,
      icon: Users,
      label: iv.interviewer || t("tabInterviews"),
      notiz: iv.notiz,
      href: `/applicants/${applicant._id}/interviews/${iv._id}`,
      upcoming: false,
    })),
  ];
  return entries.sort((a, b) =>
    (b.date + (b.time ?? "00:00")).localeCompare(a.date + (a.time ?? "00:00"))
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
  const profiles = useQuery(api.applicants.listProfiles);
  const update = useMutation(api.applicants.update);
  const handleError = useErrorHandler();
  const [notiz, setNotiz] = useState(applicant.notizen ?? "");
  const isHighlighted = (skill: string) =>
    highlight.some(h => h.toLowerCase() === skill.toLowerCase());

  const profile = profiles?.find(p => p._id === applicant.profilId) ?? null;
  const matched = profile ? matchSkills(profile.skills, applicant) : [];
  const missing = profile
    ? profile.skills.filter(s => !matched.includes(s))
    : [];

  const timeline = useMemo(
    () => buildTimeline(applicant, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applicant]
  );

  function patch(fields: Parameters<typeof update>[0]) {
    update(fields).catch(handleError);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
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
                onBlur={e => {
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
              <p className="text-sm font-semibold">
                {t("skillMatch")}
                {profile &&
                  ` – ${profile.name} (${matched.length}/${profile.skills.length})`}
              </p>
              {!profiles || profiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("noProfilesYet")}
                </p>
              ) : (
                <>
                  <Select
                    value={applicant.profilId ?? "none"}
                    onValueChange={v =>
                      patch({
                        applicantId: applicant._id,
                        profilId:
                          v === "none"
                            ? null
                            : (v as Id<"applicantSkillProfiles">),
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        {t("noProfileAssigned")}
                      </SelectItem>
                      {profiles.map(p => (
                        <SelectItem key={p._id} value={p._id}>
                          {p.name} ({p.skills.length})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {profile && profile.skills.length > 0 && (
                    <div className="space-y-1 text-sm">
                      {matched.map(s => (
                        <div
                          key={s}
                          className={cn(
                            "flex items-center gap-2 rounded px-1 -mx-1",
                            isHighlighted(s) && "skill-hl"
                          )}
                        >
                          <span className="font-bold text-success">✓</span> {s}
                        </div>
                      ))}
                      {missing.map(s => (
                        <div
                          key={s}
                          className="flex items-center gap-2 text-muted-foreground"
                        >
                          <span className="font-bold text-destructive">✕</span>{" "}
                          {s}
                        </div>
                      ))}
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
                    {applicant.skills.map(s => (
                      <Badge
                        key={s}
                        variant="muted"
                        className={cn(isHighlighted(s) && "skill-hl")}
                      >
                        {s}
                      </Badge>
                    ))}
                  </div>
                </>
              )}
            </div>

            {(applicant.zusammenfassung ||
              applicant.berufserfahrung ||
              applicant.ausbildung) && (
              <div className="space-y-3 border-t border-border/60 pt-4">
                <p className="text-sm font-semibold">
                  {t("profileFromDocuments")}
                </p>
                {applicant.zusammenfassung && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("summary")}
                    </p>
                    <p className="text-sm leading-relaxed">
                      {applicant.zusammenfassung}
                    </p>
                  </div>
                )}
                {applicant.berufserfahrung && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("experience")}
                    </p>
                    <p className="text-sm leading-relaxed">
                      {applicant.berufserfahrung}
                    </p>
                  </div>
                )}
                {applicant.ausbildung && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("education")}
                    </p>
                    <p className="text-sm leading-relaxed">
                      {applicant.ausbildung}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-semibold">{t("contactData")}</p>
              <Field
                label={t("name")}
                value={applicant.name}
                onSave={v => patch({ applicantId: applicant._id, name: v })}
              />
              <Field
                label={t("email")}
                value={applicant.email ?? ""}
                onSave={v => patch({ applicantId: applicant._id, email: v })}
              />
              <Field
                label={t("phone")}
                value={applicant.telefon ?? ""}
                onSave={v => patch({ applicantId: applicant._id, telefon: v })}
              />
              <Field
                label={t("address")}
                value={applicant.adresse ?? ""}
                onSave={v => patch({ applicantId: applicant._id, adresse: v })}
              />
              <Field
                label={t("birthDate")}
                value={applicant.geburtsdatum ?? ""}
                onSave={v =>
                  patch({ applicantId: applicant._id, geburtsdatum: v })
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-semibold">{t("internalNotes")}</p>
              <Textarea
                className="min-h-32"
                value={notiz}
                onChange={e => setNotiz(e.target.value)}
                onBlur={() =>
                  notiz !== (applicant.notizen ?? "") &&
                  patch({ applicantId: applicant._id, notizen: notiz })
                }
                placeholder={t("internalNotesPlaceholder")}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-1 p-4">
          <p className="mb-2 text-sm font-semibold">{t("timeline")}</p>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("timelineEmpty")}
            </p>
          ) : (
            timeline.map(entry => (
              <Link
                key={entry.id}
                href={entry.href}
                className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent/40"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                    entry.upcoming
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <entry.icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium">
                    {entry.label}
                    {entry.upcoming && (
                      <Badge variant="outline" className="text-[10px]">
                        {t("upcoming")}
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatIsoDate(entry.date, locale)}
                    {entry.time ? ` · ${entry.time}` : ""}
                  </p>
                  {entry.notiz && (
                    <p className="mt-0.5 line-clamp-2 text-muted-foreground">
                      {entry.notiz}
                    </p>
                  )}
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
