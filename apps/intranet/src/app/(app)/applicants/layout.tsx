"use client";

import type { ReactNode } from "react";

import { useHasApplicantAccess } from "@/components/providers/current-user";

/**
 * Access scope for Bewerbermanagement. Gated behind `useHasApplicantAccess()`
 * (admins, granted users, and delegates) — a narrower, per-user allowlist on
 * top of normal intranet auth, not tied to the manager/employee tier. Real
 * enforcement is server-side (`requireApplicantAccess` in Convex); this only
 * avoids flashing the UI at someone who'll immediately get 403s from every
 * query.
 */
export default function ApplicantsLayout({ children }: { children: ReactNode }) {
  const hasAccess = useHasApplicantAccess();

  if (!hasAccess) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">403</p>
    );
  }

  return children;
}
