"use client";

import { useEffect, useState } from "react";

import { useParams, useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";

import { Uebersicht } from "@/components/applicants/tabs/Uebersicht";

export default function ApplicantUebersichtPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const applicantId = params.id as Id<"applicants">;
  const applicant = useQuery(api.applicants.get, { applicantId });

  const highlightParam = searchParams.get("highlight");
  const [highlight] = useState(() =>
    highlightParam
      ? highlightParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  );
  useEffect(() => {
    if (highlightParam) {
      router.replace(`/hr/${applicantId}/uebersicht`);
    }
  }, [highlightParam, applicantId, router]);

  if (!applicant) return null;
  return <Uebersicht applicant={applicant} highlight={highlight} />;
}
