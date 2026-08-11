"use client";

import { type ReactNode } from "react";

import { Dokumente } from "@/components/applicants/tabs/Dokumente";
import { useApplicant } from "@/components/applicants/useApplicantSubItem";

export default function ApplicantDokumenteLayout({ children }: { children: ReactNode }) {
  const applicant = useApplicant();
  if (!applicant) return null;
  return (
    <>
      <Dokumente applicant={applicant} />
      {children}
    </>
  );
}
