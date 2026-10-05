"use client";

import { Suspense } from "react";

import { useSearchParams } from "next/navigation";

import { useIsAdmin } from "@/components/providers/current-user";
import { Entries, entriesInitialDate } from "@/components/zeiterfassung/Entries";

function EntriesPage() {
  const params = useSearchParams();
  const isAdmin = useIsAdmin();
  return <Entries direct={isAdmin} initialDate={entriesInitialDate(params.get("date"))} />;
}

export default function ArbeitszeitenPage() {
  return (
    <Suspense>
      <EntriesPage />
    </Suspense>
  );
}
