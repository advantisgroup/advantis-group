"use client";

import { type ReactNode } from "react";

import { Termine } from "@/components/applicants/tabs/Termine";
import { useApplicant } from "@/components/applicants/useApplicantSubItem";

/**
 * List content lives here (not in page.tsx) so that navigating to
 * /applicants/{id}/termine/{terminId} still renders this list underneath —
 * the nested route's page.tsx only adds the modal on top via `children`.
 */
export default function ApplicantTermineLayout({ children }: { children: ReactNode }) {
  const applicant = useApplicant();
  if (!applicant) return null;
  return (
    <>
      <Termine applicant={applicant} />
      {children}
    </>
  );
}
