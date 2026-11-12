"use client";

import { OnboardingMirror } from "@/components/performance/OnboardingMirror";
import { usePerformanceAccess } from "@/components/performance/PerformanceAccess";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";

/** "Kunden-Spiegel" of a dashboard linked to the Onboarding-Cockpit. */
export default function KundenSpiegelPage() {
  const dashboard = usePerformanceAccess().dashboard;
  if (!dashboard?.cockpit) return <PerformanceContentSkeleton />;
  return <OnboardingMirror companyId={dashboard.companyId} />;
}
