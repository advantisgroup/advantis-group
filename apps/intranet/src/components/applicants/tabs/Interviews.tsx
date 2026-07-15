"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Plus, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { InterviewDialog } from "@/components/applicants/EntryDialogs";
import { EntryRow } from "@/components/applicants/EntryRow";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

export function Interviews({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const removeInterview = useMutation(api.applicants.removeInterview);
  const handleError = useErrorHandler();
  const [logOpen, setLogOpen] = useState(false);

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 p-4">
          <p className="text-sm font-semibold">
            {t("interviewHistory")}
            <span className="ml-1.5 text-muted-foreground">
              ({applicant.interviews.length})
            </span>
          </p>
          <Button size="sm" onClick={() => setLogOpen(true)}>
            <Plus className="size-4" />
            {t("logInterview")}
          </Button>
        </div>
        <CardContent className="p-0">
          {applicant.interviews.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title={t("noInterviewsYet")}
              className="rounded-none border-none"
              action={
                <Button size="sm" onClick={() => setLogOpen(true)}>
                  <Plus className="size-4" />
                  {t("logInterview")}
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-border/70">
              {applicant.interviews.map(iv => (
                <EntryRow
                  key={iv._id}
                  href={`/applicants/${applicant._id}/interviews/${iv._id}`}
                  icon={Users}
                  title={t("interviewOn", {
                    date: formatIsoDate(iv.datum, "de-DE"),
                  })}
                  meta={iv.interviewer || t("tabInterviews")}
                  note={iv.notiz}
                  onDelete={() =>
                    removeInterview({ interviewId: iv._id }).catch(handleError)
                  }
                  deleteLabel={t("deleteEntry")}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <InterviewDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        applicantId={applicant._id}
      />
    </div>
  );
}
