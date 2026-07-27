"use client";

import { type ReactNode } from "react";

import { AcademySessionProvider } from "@/components/guidebooks/wallbox-academy/session";
import { WordmarkLogo } from "@/components/Logo";

/**
 * Deliberately outside the `(app)` route group, so it renders without
 * `AppGate`/Clerk sign-in — the access code is the whole credential here,
 * same as the original standalone tool, so external invitees (candidates,
 * partners, ...) can take the training without an intranet account. Admin
 * stays under `(app)/guidebooks/wallbox-sales-academy/admin`, gated by both
 * an intranet account and the PIN.
 */
export default function PublicAcademyLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3">
        <WordmarkLogo />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <AcademySessionProvider>{children}</AcademySessionProvider>
      </main>
    </div>
  );
}
