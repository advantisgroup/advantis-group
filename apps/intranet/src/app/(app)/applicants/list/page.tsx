"use client";

import { Suspense } from "react";

import { ApplicantListView } from "@/components/applicants/ApplicantListView";

export default function ApplicantsListPage() {
  // Suspense because ApplicantListView reads its filters via useSearchParams.
  return (
    <Suspense fallback={null}>
      <ApplicantListView />
    </Suspense>
  );
}
