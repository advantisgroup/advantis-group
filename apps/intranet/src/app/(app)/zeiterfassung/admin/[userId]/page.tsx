"use client";

import { useParams } from "next/navigation";

import { type Id } from "@advantis/convex/dataModel";

import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { useIsAdmin } from "@/components/providers/current-user";
import { PersonAdmin } from "@/components/zeiterfassung/PersonAdmin";

export default function ZeiterfassungPersonPage() {
  const { userId } = useParams<{ userId: string }>();
  const isAdmin = useIsAdmin();
  if (!isAdmin) return <ForbiddenScreen />;
  return <PersonAdmin userId={userId as Id<"users">} />;
}
