"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { matchSkills } from "@advantis/types";
import { useMutation, useQuery } from "convex/react";
import { Briefcase, Calendar, CalendarClock, Check, Mail, PhoneCall, Users, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { type ApplicantDetail, ensureRichHtml } from "@/components/applicants/applicant-types";
import { Badge } from "@/components/ui/badge";
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

import type { LucideIcon } from "lucide-react";

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
  t: ReturnType<typeof useTranslations>,
): TimelineEntry[] {
  const now = today();
  const entries: TimelineEntry[] = [
    ...applicant.termine.map((tm) => ({
      id: `termin:${tm._id}`,
      date: tm.datum,
      time: tm.uhrzeit,
      icon: CalendarClock,
      label: `${t(`terminTyp.${tm.typ}`)} · ${t(`terminArt.${tm.art}`)}`,
      notiz: tm.notiz,
      href: `/applicants/${applicant._id}/termine/${tm._id}`,
      upcoming: !tm.uebernommen && tm.datum >= now,
    })),
    ...applicant.kontakte.map((k) => ({
      id: `kontakt:${k._id}`,
      date: k.datum,
      icon: PhoneCall,
      label: t(`kontaktArt.${k.art}`),
      notiz: k.notiz,
      href: `/applicants/${applicant._id}/kontakte/${k._id}`,
      upcoming: false,
    })),
    ...applicant.emails.map((m) => ({
      id: `email:${m._id}`,
      date: m.datum,
      icon: Mail,
      label: t(`emailKategorie.${m.kategorie}`),
      notiz: m.notiz,
      href: `/applicants/${applicant._id}/emails/${m._id}`,
      upcoming: false,
    })),
    ...applicant.interviews.map((iv) => ({
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
    (b.date + (b.time ?? "00:00")).localeCompare(a.date + (a.time ?? "00:00")),
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
    </div>
  );
}
