"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { ApplicantAccessPanel } from "@/components/applicants/ApplicantAccessPanel";
import { useCanManageApplicantAccess } from "@/components/providers/current-user";

export default function ApplicantsAccessPage() {
  const canManageAccess = useCanManageApplicantAccess();
  const router = useRouter();

  useEffect(() => {
    if (canManageAccess === false) router.replace("/hr/termine");
  }, [canManageAccess, router]);

  if (!canManageAccess) return null;
  return <ApplicantAccessPanel />;
}
