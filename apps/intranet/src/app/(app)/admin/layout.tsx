"use client";

import type { ReactNode } from "react";

import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { useHasCapability, useIsManager } from "@/components/providers/current-user";

/**
 * Broadest access gate for the whole `/admin` area — manager+, or an
 * employee holding a custom role with *any* admin-adjacent capability.
 * Deliberately wide: `/admin/integrations` is nested under this layout but
 * enforces its own narrower, capability-specific gate (`access_integrations`)
 * in its own layout, and the remaining subpages (members, roles, guests, …)
 * narrow further still. `view_activity_admin` stays in the OR below even
 * though ActivityTrack now lives at the separate top-level `/activity` route
 * (with its own gate) — it's still treated as an admin-adjacent capability
 * for the purposes of this broad outer check. This layer only keeps out
 * employees with no admin capability at all.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const isManager = useIsManager();
  const hasManageUploads = useHasCapability("manage_uploads");
  const hasManageMembers = useHasCapability("manage_members");
  const hasActivityAdmin = useHasCapability("view_activity_admin");
  const hasIntegrationsAccess = useHasCapability("access_integrations");

  const hasAnyAdminAccess =
    isManager || hasManageUploads || hasManageMembers || hasActivityAdmin || hasIntegrationsAccess;

  if (!hasAnyAdminAccess) {
    return <ForbiddenScreen />;
  }

  return children;
}
