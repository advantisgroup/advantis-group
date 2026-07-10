"use client";

import type { ReactNode } from "react";

import { useHasCapability } from "@/components/providers/current-user";

/**
 * Access scope for the third-party integrations hub. Manager+ (not
 * admin-only like `/admin/activity`) — provisioning a Clockodo account is a
 * manager-level task, not an IT-admin one. `useHasCapability` also lets in an
 * employee holding a custom role with `access_integrations`, without them
 * being promoted to manager.
 */
export default function IntegrationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const hasIntegrationsAccess = useHasCapability("access_integrations");

  if (!hasIntegrationsAccess) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">403</p>
    );
  }

  return <>{children}</>;
}
