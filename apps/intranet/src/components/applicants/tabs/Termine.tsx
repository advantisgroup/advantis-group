"use client";

import { useTranslations } from "next-intl";

import {
  type ApplicantDetail,
  today,
} from "@/components/applicants/applicant-types";
import { TerminForm, TerminRow } from "@/components/applicants/TerminCalendar";
import { Card, CardContent } from "@/components/ui/card";

export function Termine({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const sorted = [...applicant.termine].sort((a, b) =>
    (a.datum + a.uhrzeit).localeCompare(b.datum + b.uhrzeit)
  );
  const kommend = sorted.filter(tm => tm.datum >= today());
  const vergangen = sorted.filter(tm => tm.datum < today()).reverse();

  return (
    <div className="space-y-5">
      <TerminForm applicants={[]} fixedApplicantId={applicant._id} />
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-sm font-semibold">
            {t("upcomingTermine")} ({kommend.length})
          </p>
          {kommend.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noUpcomingTermine")}
            </p>
          ) : (
            kommend.map(tm => <TerminRow key={tm._id} termin={tm} />)
          )}
        </CardContent>
      </Card>
      {vergangen.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-semibold">
              {t("pastTermine")} ({vergangen.length})
            </p>
            {vergangen.map(tm => (
              <TerminRow key={tm._id} termin={tm} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
