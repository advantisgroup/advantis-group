"use client";

import { KontaktDetailModal } from "@/components/applicants/KontaktDetailModal";
import { useApplicantSubItem } from "@/components/applicants/useApplicantSubItem";

export default function ApplicantKontaktDetailPage() {
  const result = useApplicantSubItem("kontakte", "kontaktId");
  if (!result) return null;

  return <KontaktDetailModal applicantId={result.applicant._id} kontakt={result.item} />;
}
