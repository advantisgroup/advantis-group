"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { EntryDetailModal } from "@/components/applicants/EntryDetailModal";
import { formatIsoDate } from "@/lib/format";

export function InterviewDetailModal({
  applicantId,
  interview,
}: {
  applicantId: Id<"applicants">;
  interview: ApplicantDetail["interviews"][number];
}) {
  const t = useTranslations("Applicants");
  const removeInterview = useMutation(api.applicants.removeInterview);

  return (
    <EntryDetailModal
      href={`/hr/${applicantId}/interviews/${interview._id}`}
      title={t("interviewOn", { date: formatIsoDate(interview.datum, "de-DE") })}
      description={interview.interviewer || undefined}
      note={interview.notiz}
      onRemove={() => removeInterview({ interviewId: interview._id })}
    />
  );
}
