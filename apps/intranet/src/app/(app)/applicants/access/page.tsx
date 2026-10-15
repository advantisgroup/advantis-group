"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { ApplicantAccessPanel } from "@/components/applicants/ApplicantAccessPanel";
import { HrMailboxCard } from "@/components/applicants/HrMailboxCard";
import { HrOpenPositionCard } from "@/components/applicants/HrOpenPositionCard";
import { useCanManageApplicantAccess } from "@/components/providers/current-user";

export default function ApplicantsAccessPage() {
  const canManageAccess = useCanManageApplicantAccess();
  const router = useRouter();

  useEffect(() => {
    if (canManageAccess === false) router.replace("/hr/termine");
  }, [canManageAccess, router]);

  if (!canManageAccess) return null;
  return (
    <div className="space-y-6">
      <HrOpenPositionCard />
      <HrMailboxCard />
      <ApplicantAccessPanel />
    </div>
  );
}
