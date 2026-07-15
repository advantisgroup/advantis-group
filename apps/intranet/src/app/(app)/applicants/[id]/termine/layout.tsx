"use client";

import { type ReactNode } from "react";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";

import { Termine } from "@/components/applicants/tabs/Termine";

/**
 * List content lives here (not in page.tsx) so that navigating to
 * /applicants/{id}/termine/{terminId} still renders this list underneath —
 * the nested route's page.tsx only adds the modal on top via `children`.
 */
export default function ApplicantTermineLayout({
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
      <Termine applicant={applicant} />
      {children}
    </>
  );
}
