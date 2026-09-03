"use client";

import { useState } from "react";

import { CalendarPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { type ApplicantDetail, today } from "@/components/applicants/applicant-types";
import { TerminDialog } from "@/components/applicants/EntryDialogs";
import { TerminRow } from "@/components/applicants/TerminCalendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export function Termine({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const [planOpen, setPlanOpen] = useState(false);
  const sorted = [...applicant.termine].sort((a, b) =>
    (a.datum + a.uhrzeit).localeCompare(b.datum + b.uhrzeit),
  );
  const kommend = sorted.filter((tm) => tm.datum >= today());
  const vergangen = sorted.filter((tm) => tm.datum < today()).reverse();

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-primary/30">
        <div className="flex flex-col items-stretch gap-3 border-b border-border/70 bg-primary/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold">
            {t("upcomingTermine")}
            <span className="ml-1.5 text-muted-foreground">({kommend.length})</span>
          </p>
          <Button size="sm" className="w-full sm:w-auto" onClick={() => setPlanOpen(true)}>
            <CalendarPlus className="size-4" />
            {t("planTermin")}
          </Button>
        </div>
        <CardContent className="space-y-2 p-4">
          {kommend.length === 0 ? (
            <EmptyState
              icon={<CalendarPlus />}
              title={t("noUpcomingTermine")}
              className="border-none py-6"
            />
          ) : (
            kommend.map((tm) => <TerminRow key={tm._id} termin={tm} />)
          )}
        </CardContent>
      </Card>
      {vergangen.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-border/70 p-4">
            <p className="text-sm font-semibold">
              {t("pastTermine")}
              <span className="ml-1.5 text-muted-foreground">({vergangen.length})</span>
            </p>
          </div>
          <CardContent className="space-y-2 p-4">
            {vergangen.map((tm) => (
              <TerminRow key={tm._id} termin={tm} />
            ))}
          </CardContent>
        </Card>
      )}
      <TerminDialog open={planOpen} onOpenChange={setPlanOpen} fixedApplicantId={applicant._id} />
    </div>
  );
}
