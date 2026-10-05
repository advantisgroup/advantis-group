"use client";

import { Suspense } from "react";

import { useSearchParams } from "next/navigation";

import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { useIsAdmin } from "@/components/providers/current-user";
import { AdminPanel } from "@/components/zeiterfassung/AdminPanel";

function AdminSection() {
  const params = useSearchParams();
  return <AdminPanel initialSection={params.get("section")} />;
}

export default function ZeiterfassungAdminPage() {
  const isAdmin = useIsAdmin();
  if (!isAdmin) return <ForbiddenScreen />;
  return (
    <Suspense>
      <AdminSection />
    </Suspense>
  );
}
