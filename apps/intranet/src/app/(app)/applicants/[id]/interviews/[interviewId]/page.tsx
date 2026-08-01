"use client";

import { InterviewDetailModal } from "@/components/applicants/InterviewDetailModal";
import { useApplicantSubItem } from "@/components/applicants/useApplicantSubItem";

export default function ApplicantInterviewDetailPage() {
  const result = useApplicantSubItem("interviews", "interviewId");
  if (!result) return null;

  return <InterviewDetailModal applicantId={result.applicant._id} interview={result.item} />;
}
