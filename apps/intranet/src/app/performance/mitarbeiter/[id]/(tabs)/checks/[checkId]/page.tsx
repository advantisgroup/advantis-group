"use client";

import { useParams, useSearchParams } from "next/navigation";

import { type Id } from "@advantis/convex/dataModel";

import { CheckEditor } from "@/components/performance/checks/CheckEditor";

/** `/checks/neu?typ=kpi` creates, `/checks/<id>` edits. */
export default function CheckPage() {
  const params = useParams<{ id: string; checkId: string }>();
  const search = useSearchParams();
  const isNew = params.checkId === "neu";
  return (
    <CheckEditor
      key={params.checkId}
      employeeId={params.id as Id<"performanceEmployees">}
      checkId={isNew ? null : (params.checkId as Id<"performanceChecks">)}
      newType={search.get("typ") === "kpi" ? "kpi" : "employee"}
    />
  );
}
