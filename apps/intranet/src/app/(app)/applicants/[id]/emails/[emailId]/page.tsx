"use client";

import { EmailDetailModal } from "@/components/applicants/EmailDetailModal";
import { useApplicantSubItem } from "@/components/applicants/useApplicantSubItem";

export default function ApplicantEmailDetailPage() {
  const result = useApplicantSubItem("emails", "emailId");
  if (!result) return null;

  return <EmailDetailModal applicantId={result.applicant._id} email={result.item} />;
}
