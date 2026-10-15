"use client";

import { ApplicantAccessPanel } from "@/components/applicants/ApplicantAccessPanel";
import { HrMailboxCard } from "@/components/applicants/HrMailboxCard";
import { HrOpenPositionCard } from "@/components/applicants/HrOpenPositionCard";
import { useCanManageApplicantAccess } from "@/components/providers/current-user";

/** Advertised job and inbox for everyone in HR; who gets HR only for admins. */
export default function ApplicantsAccessPage() {
  const canManageAccess = useCanManageApplicantAccess();
  return (
    <div className="space-y-6">
      <HrOpenPositionCard />
      <HrMailboxCard />
      {canManageAccess && <ApplicantAccessPanel />}
    </div>
  );
}
