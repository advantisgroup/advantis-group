"use client";

import { type ReactNode } from "react";

import { Emails } from "@/components/applicants/tabs/Emails";
import { useApplicant } from "@/components/applicants/useApplicantSubItem";

export default function ApplicantEmailsLayout({ children }: { children: ReactNode }) {
  const applicant = useApplicant();
  if (!applicant) return null;
  return (
    <>
      <Emails applicant={applicant} />
      {children}
    </>
  );
}
