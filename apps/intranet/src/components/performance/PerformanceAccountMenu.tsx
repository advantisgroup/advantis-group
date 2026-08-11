"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";

import { AccountMenu } from "@/components/layout/AccountMenu";
import { CurrentUserProvider, type CurrentUser } from "@/components/providers/current-user";

/** `AccountMenu` needs `CurrentUserProvider`, which only exists inside the
 * Clerk-gated `(app)` shell — Performance runs entirely outside it (see
 * performance/layout.tsx), so there's no ambient provider to reuse. This
 * fetches the same `users.me` query `AppGate` uses and wraps `AccountMenu`
 * locally, showing it only when the visitor also happens to have a
 * provisioned intranet account signed in on this browser — the normal case
 * for anyone who reached Performance via the intranet's nav, and always the
 * case for a Clerk-linked (passwordless) session. Renders nothing otherwise
 * (e.g. a password-only login with no intranet account at all), leaving
 * Performance's own `SettingsMenu` as the fallback. */
export function PerformanceAccountMenu() {
  const me = useQuery(api.users.me);
  if (!me) return null;
  return (
    <CurrentUserProvider user={me as CurrentUser}>
      <AccountMenu />
    </CurrentUserProvider>
  );
}
