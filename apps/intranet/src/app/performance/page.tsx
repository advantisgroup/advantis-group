"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { dashboardHome, usePerformanceAccess } from "@/components/performance/PerformanceAccess";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";

// `/performance` is the entry point from the intranet sidebar: team view for
// admins and leads, otherwise the visitor's own page. The team layout shows
// the "not linked yet" note when there is neither.
export default function PerformanceIndexPage() {
  const router = useRouter();
  const { me, dashboard } = usePerformanceAccess();
  useEffect(() => {
    if (me === undefined) return;
    const home = dashboardHome(dashboard);
    router.replace(home === "/performance" ? "/performance/ueberblick" : home);
  }, [me, dashboard, router]);
  return <PerformancePageSkeleton />;
}
