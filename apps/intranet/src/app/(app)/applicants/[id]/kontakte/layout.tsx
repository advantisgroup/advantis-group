"use client";

import { type ReactNode } from "react";

import { Kontakte } from "@/components/applicants/tabs/Kontakte";
import { useApplicant } from "@/components/applicants/useApplicantSubItem";

export default function ApplicantKontakteLayout({ children }: { children: ReactNode }) {
  const applicant = useApplicant();
  if (!applicant) return null;
  return (
    <>
      <Kontakte applicant={applicant} />
      {children}
    </>
  );
}
