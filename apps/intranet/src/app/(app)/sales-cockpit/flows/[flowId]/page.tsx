"use client";

import { useParams } from "next/navigation";

import { type Id } from "@advantis/convex/dataModel";

import { FlowComposer } from "@/components/sales-cockpit/FlowComposer";

export default function SalesCockpitFlowPage() {
  const params = useParams<{ flowId: string }>();
  return <FlowComposer flowId={params.flowId as Id<"salesCockpitFlows">} />;
}
