"use client";

import { useEffect } from "react";

import { useParams, useRouter } from "next/navigation";

// Employee detail is now a RouteTabs layout — this bare route just forwards
// to its default tab so links/bookmarks to `/performance/mitarbeiter/{id}`
// keep working.
export default function EmployeeDetailIndexPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  useEffect(() => {
    router.replace(`/performance/mitarbeiter/${params.id}/ueberblick`);
  }, [router, params.id]);
  return null;
}
