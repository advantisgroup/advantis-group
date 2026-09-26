import { CalendarClock, Mail, PhoneCall, Users } from "lucide-react";

import { type ApplicantDetail, today } from "@/components/applicants/applicant-types";

import type { LucideIcon } from "lucide-react";
import type { useTranslations } from "next-intl";

export interface TimelineEntry {
  id: string;
  date: string;
  time?: string;
  icon: LucideIcon;
  label: string;
  notiz?: string;
  href: string;
  upcoming: boolean;
}

/** Everything that happened on a file — appointments, contacts, emails,
 *  interviews — newest first. Shared by the overview tab and the printed
 *  handoff brief. */
export function buildTimeline(
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
      href: `/hr/${applicant._id}/termine/${tm._id}`,
      upcoming: !tm.uebernommen && tm.datum >= now,
    })),
    ...applicant.kontakte.map((k) => ({
      id: `kontakt:${k._id}`,
      date: k.datum,
      icon: PhoneCall,
      label: t(`kontaktArt.${k.art}`),
      notiz: k.notiz,
      href: `/hr/${applicant._id}/kontakte/${k._id}`,
      upcoming: false,
    })),
    ...applicant.emails.map((m) => ({
      id: `email:${m._id}`,
      date: m.datum,
      icon: Mail,
      label: t(`emailKategorie.${m.kategorie}`),
      notiz: m.notiz,
      href: `/hr/${applicant._id}/emails/${m._id}`,
      upcoming: false,
    })),
    ...applicant.interviews.map((iv) => ({
      id: `interview:${iv._id}`,
      date: iv.datum,
      icon: Users,
      label: iv.interviewer || t("tabInterviews"),
      notiz: iv.notiz,
      href: `/hr/${applicant._id}/interviews/${iv._id}`,
      upcoming: false,
    })),
  ];
  return entries.sort((a, b) =>
    (b.date + (b.time ?? "00:00")).localeCompare(a.date + (a.time ?? "00:00")),
  );
}
