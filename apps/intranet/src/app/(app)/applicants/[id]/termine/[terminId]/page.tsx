"use client";

import { TerminDetailModal } from "@/components/applicants/TerminDetailModal";
import { useApplicantSubItem } from "@/components/applicants/useApplicantSubItem";

export default function ApplicantTerminDetailPage() {
  const result = useApplicantSubItem("termine", "terminId");
  if (!result) return null;

  return <TerminDetailModal applicantId={result.applicant._id} termin={result.item} />;
}
