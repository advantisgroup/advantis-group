"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * The tenant `proxy.ts` resolved for this request, threaded down from
 * `performance/layout.tsx` (a Server Component reading the
 * `x-performance-company-id`/`x-performance-company-slug` headers it set).
 * `slug` is what the client-side `login`/`setupAccount` actions need to
 * scope themselves to the right company — the header itself is UI-only,
 * never a trust boundary (see `proxy.ts`'s doc comment): every Convex call
 * re-derives `companyId` from the resolved session, not from this context.
 *
 * `null` on the grandfathered main intranet host (no company domain
 * involved) — callers fall back to Advantis's own slug in that case (see
 * `usePerformanceCompanySlug`).
 */
interface PerformanceCompany {
  companyId: string;
  slug: string;
}

const PerformanceCompanyContext = createContext<PerformanceCompany | null>(
  null
);

export function PerformanceCompanyProvider({
  company,
  children,
}: {
  company: PerformanceCompany | null;
  children: ReactNode;
}) {
  return (
    <PerformanceCompanyContext.Provider value={company}>
      {children}
    </PerformanceCompanyContext.Provider>
  );
}

export function usePerformanceCompany(): PerformanceCompany | null {
  return useContext(PerformanceCompanyContext);
}

/** The slug `login`/`setupAccount` should scope to — the resolved tenant's,
 * or "advantis" on the main intranet host where no `proxy.ts` rewrite ever
 * ran (today's production hostname, grandfathered per the migration). */
export function usePerformanceCompanySlug(): string {
  return usePerformanceCompany()?.slug ?? "advantis";
}
