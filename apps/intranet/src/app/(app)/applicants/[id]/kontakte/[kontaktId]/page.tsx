"use client";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";

import { KontaktDetailModal } from "@/components/applicants/KontaktDetailModal";

export default function ApplicantKontaktDetailPage() {
  const params = useParams<{ id: string; kontaktId: string }>();
  const applicantId = params.id as Id<"applicants">;
  const applicant = useQuery(api.applicants.get, { applicantId });

  if (!applicant) return null;
  const kontakt = applicant.kontakte.find(k => k._id === params.kontaktId);
  if (!kontakt) return null;

  return <KontaktDetailModal applicantId={applicantId} kontakt={kontakt} />;
}
