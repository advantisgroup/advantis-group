"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { type EmployeeState, stateBadgeVariant } from "@/lib/activity/format";

/** A localized, colour-coded badge for a fused employee state. */
export function StateBadge({
  state,
}: {
  state: EmployeeState | null | undefined;
}) {
  const t = useTranslations("Activity.states");
  if (!state) return <Badge variant="muted">—</Badge>;
  return <Badge variant={stateBadgeVariant(state)}>{t(state)}</Badge>;
}
