"use client";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";

import { InterviewDetailModal } from "@/components/applicants/InterviewDetailModal";

export default function ApplicantInterviewDetailPage() {
  const params = useParams<{ id: string; interviewId: string }>();
  const applicantId = params.id as Id<"applicants">;
  const applicant = useQuery(api.applicants.get, { applicantId });

  if (!applicant) return null;
  const interview = applicant.interviews.find(
    iv => iv._id === params.interviewId
  );
  if (!interview) return null;

  return (
    <InterviewDetailModal applicantId={applicantId} interview={interview} />
  );
}
