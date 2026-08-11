"use client";

import { type ReactNode } from "react";

import { Interviews } from "@/components/applicants/tabs/Interviews";
import { useApplicant } from "@/components/applicants/useApplicantSubItem";

export default function ApplicantInterviewsLayout({ children }: { children: ReactNode }) {
  const applicant = useApplicant();
  if (!applicant) return null;
  return (
    <>
      <Interviews applicant={applicant} />
      {children}
    </>
  );
}
