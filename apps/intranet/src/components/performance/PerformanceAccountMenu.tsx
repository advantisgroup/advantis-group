"use client";

import { AccountMenu } from "@/components/layout/AccountMenu";

/** The intranet's account menu in Performance's own header. Performance runs
 * inside `AppGate` (rendered bare), which already provides the current user. */
export function PerformanceAccountMenu() {
  return <AccountMenu />;
}
