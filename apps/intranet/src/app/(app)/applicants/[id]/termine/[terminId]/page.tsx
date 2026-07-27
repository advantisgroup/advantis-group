"use client";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";

import { TerminDetailModal } from "@/components/applicants/TerminDetailModal";

export default function ApplicantTerminDetailPage() {
  const params = useParams<{ id: string; terminId: string }>();
  const applicantId = params.id as Id<"applicants">;
  const applicant = useQuery(api.applicants.get, { applicantId });

  if (!applicant) return null;
  const termin = applicant.termine.find((t) => t._id === params.terminId);
  if (!termin) return null;

  return <TerminDetailModal applicantId={applicantId} termin={termin} />;
}
