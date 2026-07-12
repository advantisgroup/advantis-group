"use client";

import { useState } from "react";

import { CalendarPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  type ApplicantDetail,
  today,
} from "@/components/applicants/applicant-types";
import { TerminDialog } from "@/components/applicants/EntryDialogs";
import { TerminRow } from "@/components/applicants/TerminCalendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export function Termine({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const [planOpen, setPlanOpen] = useState(false);
  const sorted = [...applicant.termine].sort((a, b) =>
    (a.datum + a.uhrzeit).localeCompare(b.datum + b.uhrzeit)
  );
  const kommend = sorted.filter(tm => tm.datum >= today());
  const vergangen = sorted.filter(tm => tm.datum < today()).reverse();

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">
              {t("upcomingTermine")} ({kommend.length})
            </p>
            <Button size="sm" onClick={() => setPlanOpen(true)}>
              <CalendarPlus className="size-4" />
              {t("planTermin")}
            </Button>
          </div>
          {kommend.length === 0 ? (
            <EmptyState icon={<CalendarPlus />} title={t("noUpcomingTermine")} />
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
      <TerminDialog
        open={planOpen}
        onOpenChange={setPlanOpen}
        fixedApplicantId={applicant._id}
      />
    </div>
  );
}
