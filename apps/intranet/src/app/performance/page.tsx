"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";

// Team-Dashboard is now a RouteTabs layout under `(dashboard)/` — this bare
// route just forwards to its default tab so `/performance` keeps working as
// a bookmark/nav target. The tabs layout does its own session/role redirect
// (e.g. sending Mitarbeiter logins to their own detail page).
export default function PerformanceIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/performance/ueberblick");
  }, [router]);
  return <PerformancePageSkeleton />;
}
