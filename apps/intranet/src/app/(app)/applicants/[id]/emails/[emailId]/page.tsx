"use client";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";

import { EmailDetailModal } from "@/components/applicants/EmailDetailModal";

export default function ApplicantEmailDetailPage() {
  const params = useParams<{ id: string; emailId: string }>();
  const applicantId = params.id as Id<"applicants">;
  const applicant = useQuery(api.applicants.get, { applicantId });

  if (!applicant) return null;
  const email = applicant.emails.find((m) => m._id === params.emailId);
  if (!email) return null;

  return <EmailDetailModal applicantId={applicantId} email={email} />;
}
