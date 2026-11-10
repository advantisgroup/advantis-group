"use client";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { OnboardingTiles } from "@/components/performance/OnboardingKpis";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceYm } from "@/components/performance/PerformanceYmContext";
import { Card } from "@/components/ui/card";

/** One person's onboarding figures from the cockpit, with VM/VJ. */
export default function EmployeeOnboardingPage() {
  const t = useTranslations("Performance.onboarding");
  const params = useParams<{ id: string }>();
  const [ym] = usePerformanceYm();
  const data = useQuery(api.performance.onboardingKpis.employee, {
    employeeId: params.id as Id<"performanceEmployees">,
    ym,
  });

  if (!data) return <PerformanceContentSkeleton />;

  return (
    <div className="space-y-4">
      {!data.linked && <Card className="p-4 text-sm text-warn">{t("notLinkedHint")}</Card>}
      <OnboardingTiles cur={data.cur} vm={data.vm} vj={data.vj} />
    </div>
  );
}
