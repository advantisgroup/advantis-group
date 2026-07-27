"use client";

import { type ReactNode } from "react";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";

import { Dokumente } from "@/components/applicants/tabs/Dokumente";

export default function ApplicantDokumenteLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const applicantId = params.id as Id<"applicants">;
  const applicant = useQuery(api.applicants.get, { applicantId });

  if (!applicant) return null;
  return (
    <>
      <Dokumente applicant={applicant} />
      {children}
    </>
  );
}
