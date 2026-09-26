"use client";

import { api } from "@advantis/convex/api";
import { matchSkills } from "@advantis/types";
import { useQuery } from "convex/react";
import { Check, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { AmpelDot } from "@/components/applicants/AmpelBadge";
import {
  type ApplicantDetail,
  ensureRichHtml,
  today,
} from "@/components/applicants/applicant-types";
import { buildTimeline } from "@/components/applicants/timeline";
import {
  type PrintField,
  PrintFields,
  PrintRichText,
  PrintSection,
  PrintSheet,
  PrintTitle,
} from "@/components/print/PrintSheet";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** More than this and the brief stops being a brief; the rest stays in the file. */
const TIMELINE_LIMIT = 12;

/**
 * The applicant file on paper, for handing a candidate over to whoever
 * interviews or onboards them. The screen page is an editor — every field is
 * an input, notes are a toolbar-topped editor, the rail is cards — none of
 * which reads on paper, so this lays out the same record as a document:
 * who, where they stand, how to reach them, what was said, what's next.
 * Mounted on every applicant tab so Ctrl+P anywhere in the file prints it.
 */
export function HandoffBriefPrint({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const locale = useLocale();
  const profiles = useQuery(api.hr.applicants.listProfiles);

  const timeline = buildTimeline(applicant, t);
  const latest = timeline[0] ?? null;
  const upcoming = applicant.termine
    .filter((termin) => !termin.uebernommen && termin.datum >= today())
    .sort((a, b) => (a.datum + a.uhrzeit).localeCompare(b.datum + b.uhrzeit));
  const next = upcoming[0];
  const profile = profiles?.find((p) => p._id === applicant.profilId) ?? null;
  const matched = profile ? matchSkills(profile.skills, applicant) : [];
  const cvFields = [
    { label: t("summary"), html: applicant.zusammenfassung },
    { label: t("experience"), html: applicant.berufserfahrung },
    { label: t("education"), html: applicant.ausbildung },
  ].filter((field) => field.html?.trim());
  const status = t(applicant.status === "neu" ? "statusNeu" : "statusPool");
  const date = (iso: string) => formatIsoDate(iso, locale);

  const glance: PrintField[] = [
    { label: t("handoffStatus"), value: status },
    {
      label: t("ourRating"),
      value: (
        <span className="inline-flex items-center gap-1.5">
          <AmpelDot rating={applicant.rating} />
          {t(`ampel.${applicant.rating ?? "offen"}`)}
        </span>
      ),
    },
    {
      label: t("handoffLatestTouchpoint"),
      value: latest ? `${latest.label} · ${date(latest.date)}` : t("handoffNoActivity"),
    },
    {
      label: t("handoffNextStep"),
      value: next
        ? `${t(`terminTyp.${next.typ}`)} · ${date(next.datum)}${next.uhrzeit ? ` · ${next.uhrzeit}` : ""}`
        : t("noUpcomingTermine"),
    },
    {
      label: t("documentsInFile"),
      value: applicant.documents.length
        ? `${applicant.documents.length} · ${applicant.documents.map((d) => d.fileName).join(", ")}`
        : "0",
    },
    {
      label: t("poolConsent"),
      value: applicant.poolConsentUntil
        ? t("poolConsentUntil", {
            date: date(new Date(applicant.poolConsentUntil).toISOString().slice(0, 10)),
          })
        : t("poolConsentNone"),
    },
  ];

  const contact: PrintField[] = [
    { label: t("email"), value: applicant.email || "—" },
    { label: t("phone"), value: applicant.telefon || "—" },
    { label: t("birthDate"), value: applicant.geburtsdatum ? date(applicant.geburtsdatum) : "—" },
    { label: t("address"), value: applicant.adresse || "—", wide: true },
  ];

  return (
    <PrintSheet
      title={`${t("handoffBrief")} – ${applicant.name}`}
      area={t("pageTitle")}
      kind={t("handoffBrief")}
      notice={t("handoffPrintNotice")}
    >
      <PrintTitle title={applicant.name} lead={applicant.position || t("positionUnknown")}>
        <span>{status}</span>
        <span>
          {t("receivedOn", {
            date: date(new Date(applicant.createdAt).toISOString().slice(0, 10)),
          })}
        </span>
      </PrintTitle>

      <PrintSection title={t("handoffAtAGlance")}>
        <PrintFields items={glance} />
        {latest?.notiz && (
          <div className="mt-[4mm] border-l-2 border-primary pl-[3mm]">
            <p className="text-[7pt] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {t("handoffLatestNote")}
            </p>
            <p className="mt-[0.75mm] whitespace-pre-wrap">{latest.notiz}</p>
          </div>
        )}
      </PrintSection>

      <PrintSection title={t("contactData")}>
        <PrintFields items={contact} columns={3} />
      </PrintSection>

      {(profile || applicant.skills.length > 0) && (
        <PrintSection title={t("skillMatch")}>
          {profile && profile.skills.length > 0 && (
            <>
              <p className="font-medium">
                {t("handoffSkillProfile", {
                  profile: profile.name,
                  matched: matched.length,
                  total: profile.skills.length,
                })}
              </p>
              <ul className="mt-[2mm] grid grid-cols-2 gap-x-[8mm] gap-y-[1mm]">
                {profile.skills.map((skill) => {
                  const has = matched.includes(skill);
                  return (
                    <li
                      key={skill}
                      className={cn("flex items-center gap-1.5", !has && "text-muted-foreground")}
                    >
                      {has ? (
                        <Check className="size-3 shrink-0 text-success" />
                      ) : (
                        <X className="size-3 shrink-0 text-destructive" />
                      )}
                      {skill}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {applicant.skills.length > 0 && (
            <p className="mt-[3mm]">
              <span className="text-muted-foreground">{t("skillsFromDocuments")}: </span>
              {applicant.skills.join(", ")}
            </p>
          )}
        </PrintSection>
      )}

      {cvFields.length > 0 && (
        <PrintSection title={t("profileFromDocuments")}>
          <div className="space-y-[4mm]">
            {cvFields.map((field) => (
              <div key={field.label}>
                <h3 className="mb-[1mm] text-[9pt] font-semibold">{field.label}</h3>
                <PrintRichText html={ensureRichHtml(field.html ?? "")} />
              </div>
            ))}
          </div>
        </PrintSection>
      )}

      {upcoming.length > 0 && (
        <PrintSection title={t("upcomingTermine")}>
          <EntryList
            entries={upcoming.map((termin) => ({
              key: termin._id,
              when: `${date(termin.datum)}${termin.uhrzeit ? ` · ${termin.uhrzeit}` : ""}`,
              label: `${t(`terminTyp.${termin.typ}`)} · ${t(`terminArt.${termin.art}`)}`,
              note: termin.notiz,
            }))}
          />
        </PrintSection>
      )}

      <PrintSection title={t("timeline")}>
        {timeline.length === 0 ? (
          <p className="text-muted-foreground">{t("handoffNoActivity")}</p>
        ) : (
          <>
            <EntryList
              entries={timeline.slice(0, TIMELINE_LIMIT).map((entry) => ({
                key: entry.id,
                when: `${date(entry.date)}${entry.time ? ` · ${entry.time}` : ""}`,
                label: entry.label,
                note: entry.notiz,
              }))}
            />
            {timeline.length > TIMELINE_LIMIT && (
              <p className="mt-[2mm] text-[9pt] text-muted-foreground">
                {t("handoffEarlierEntries", { count: timeline.length - TIMELINE_LIMIT })}
              </p>
            )}
          </>
        )}
      </PrintSection>

      {applicant.notizen?.trim() && (
        <PrintSection title={t("internalNotes")}>
          <PrintRichText html={ensureRichHtml(applicant.notizen)} />
        </PrintSection>
      )}
    </PrintSheet>
  );
}

/** Dated entries as a two-column list: the date in a narrow left column, what
 *  happened (and its note) beside it. */
function EntryList({
  entries,
}: {
  entries: { key: string; when: string; label: string; note?: string }[];
}) {
  return (
    <ol className="divide-y divide-foreground/10">
      {entries.map((entry) => (
        <li key={entry.key} className="grid grid-cols-[32mm_1fr] gap-x-[4mm] py-[1.75mm]">
          <span className="tabular-nums text-muted-foreground">{entry.when}</span>
          <span>
            <span className="font-medium">{entry.label}</span>
            {entry.note && (
              <span className="mt-[0.5mm] block whitespace-pre-wrap text-[9pt] text-muted-foreground">
                {entry.note}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
