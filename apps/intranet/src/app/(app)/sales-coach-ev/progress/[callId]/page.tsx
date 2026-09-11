"use client";

import { useParams } from "next/navigation";

import { CallReportView } from "@/components/sales-coach-ev/CallReportView";

export default function SalesCoachEvReportPage() {
  const { callId } = useParams<{ callId: string }>();
  return <CallReportView key={callId} callId={callId} />;
}
