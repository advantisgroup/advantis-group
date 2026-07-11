import { type api } from "@advantis/convex/api";

import { AMPEL_ORDER, type Ampel } from "@/components/applicants/AmpelBadge";

import type { FunctionReturnType } from "convex/server";

type Applicant = FunctionReturnType<typeof api.applicants.list>[number];

/**
 * Recomputes the exact filtered/sorted sequence a user was looking at in
 * `ApplicantListView` (mode + search +, for the pool, an optional rating
 * group filter) — shared so "next/previous applicant" on the detail page
 * steps through the same order the list showed, without duplicating the
 * filter/group logic in two places.
 */
export function buildApplicantSequence(
  applicants: Applicant[],
  mode: "neu" | "pool",
  search: string,
  poolFilter: Ampel | null
): Applicant[] {
  const q = search.trim().toLowerCase();
  const filtered = applicants
    .filter(a => a.status === mode)
    .filter(a => {
      if (!q) return true;
      return [
        a.name,
        a.email,
        a.position,
        a.telefon,
        a.adresse,
        ...(a.skills ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

  if (mode !== "pool") return filtered;

  const ratings: (Ampel | null)[] = poolFilter
    ? [poolFilter]
    : [...AMPEL_ORDER, null];
  return ratings.flatMap(rating =>
    filtered.filter(a => (rating === null ? !a.rating : a.rating === rating))
  );
}
