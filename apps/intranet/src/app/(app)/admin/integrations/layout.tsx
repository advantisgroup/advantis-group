"use client";

import type { ReactNode } from "react";

import { useIsManager } from "@/components/providers/current-user";

/**
 * Access scope for the third-party integrations hub. Manager+ (not
 * admin-only like `/admin/activity`) — provisioning a Clockodo account is a
 * manager-level task, not an IT-admin one.
 */
export default function IntegrationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const isManager = useIsManager();

  if (!isManager) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">403</p>
    );
  }

  return <>{children}</>;
}
