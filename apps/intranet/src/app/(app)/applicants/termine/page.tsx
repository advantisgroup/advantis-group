"use client";

import { Suspense } from "react";

import { TerminCalendar } from "@/components/applicants/TerminCalendar";

export default function ApplicantsTerminePage() {
  // The calendar reads `?von=` (opened from an Akte).
  return (
    <Suspense>
      <TerminCalendar />
    </Suspense>
  );
}
