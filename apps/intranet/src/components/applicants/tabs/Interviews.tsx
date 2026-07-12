"use client";

import { useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Plus, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { InterviewDialog } from "@/components/applicants/EntryDialogs";
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
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{t("interviewHistory")}</p>
            <Button size="sm" onClick={() => setLogOpen(true)}>
              <Plus className="size-4" />
              {t("logInterview")}
            </Button>
          </div>
          {applicant.interviews.length === 0 ? (
            <EmptyState icon={<Users />} title={t("noInterviewsYet")} />
          ) : (
            applicant.interviews.map(iv => (
              <Link
                key={iv._id}
                href={`/applicants/${applicant._id}/interviews/${iv._id}`}
                className="flex items-start gap-3 rounded-lg border border-border/60 p-3 text-sm transition-colors hover:bg-accent/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {t("interviewOn", {
                      date: formatIsoDate(iv.datum, "de-DE"),
                    })}
                    {iv.interviewer ? ` · ${iv.interviewer}` : ""}
                  </p>
                  {iv.notiz && (
                    <p className="mt-1 text-muted-foreground">{iv.notiz}</p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={t("deleteEntry")}
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeInterview({ interviewId: iv._id }).catch(handleError);
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  ✕
                </button>
              </Link>
            ))
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
