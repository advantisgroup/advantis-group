"use client";

import { NewDraftRedirect } from "@/components/compose/NewDraftRedirect";

export default function NewSalesCockpitProjectPage() {
  return (
    <NewDraftRedirect
      surface="salesCockpitProject"
      to={(id) => `/sales-cockpit/projekte/draft/${id}`}
    />
  );
}
