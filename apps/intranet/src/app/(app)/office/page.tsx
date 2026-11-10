"use client";

import { Suspense } from "react";

import { FloorPlan } from "@/components/office/FloorPlan";

export default function OfficePage() {
  return (
    <Suspense>
      <FloorPlan />
    </Suspense>
  );
}
