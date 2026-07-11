"use client";

import { type ReactNode } from "react";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";

import { Interviews } from "@/components/applicants/tabs/Interviews";

export default function ApplicantInterviewsLayout({
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
      <Interviews applicant={applicant} />
      {children}
    </>
  );
}
