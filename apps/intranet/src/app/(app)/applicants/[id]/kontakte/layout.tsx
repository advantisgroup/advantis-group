"use client";

import { type ReactNode } from "react";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";

import { Kontakte } from "@/components/applicants/tabs/Kontakte";

export default function ApplicantKontakteLayout({
  children,
}: {
  children: ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const applicantId = params.id as Id<"applicants">;
  const applicant = useQuery(api.applicants.get, { applicantId });

  if (!applicant) return null;
  return (
    <>
      <Kontakte applicant={applicant} />
      {children}
    </>
  );
}
