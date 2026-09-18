"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { InterviewDialog } from "@/components/applicants/EntryDialogs";
import { EntryListCard } from "@/components/applicants/EntryListCard";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

export function Interviews({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const removeInterview = useMutation(api.hr.applicants.removeInterview);
  const handleError = useErrorHandler();
  const [logOpen, setLogOpen] = useState(false);

  return (
    <>
      <EntryListCard
        historyLabel={t("interviewHistory")}
        logLabel={t("logInterview")}
        onLog={() => setLogOpen(true)}
        emptyIcon={<Users />}
        emptyLabel={t("noInterviewsYet")}
        deleteLabel={t("deleteEntry")}
        rows={applicant.interviews.map((iv) => ({
          _id: iv._id,
          href: `/hr/${applicant._id}/interviews/${iv._id}`,
          icon: Users,
          title: t("interviewOn", { date: formatIsoDate(iv.datum, "de-DE") }),
          meta: iv.interviewer || t("tabInterviews"),
          note: iv.notiz,
          onDelete: () => removeInterview({ interviewId: iv._id }).catch(handleError),
        }))}
      />
      <InterviewDialog open={logOpen} onOpenChange={setLogOpen} applicantId={applicant._id} />
    </>
  );
}
