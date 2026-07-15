import { type api } from "@advantis/convex/api";

import { type Ampel } from "@/components/applicants/AmpelBadge";

import type { FunctionReturnType } from "convex/server";

type Applicant = FunctionReturnType<typeof api.applicants.list>[number];

export type StatusFilter = "alle" | "neu" | "pool";
export type RatingFilter = "alle" | Ampel | "offen";

export interface ApplicantFilter {
  status: StatusFilter;
  rating: RatingFilter;
  search: string;
}

export function parseStatusFilter(raw: string | null): StatusFilter {
  return raw === "neu" || raw === "pool" ? raw : "alle";
}

export function parseRatingFilter(raw: string | null): RatingFilter {
  return raw === "rot" || raw === "blau" || raw === "gruen" || raw === "offen"
    ? raw
    : "alle";
}

/**
 * Applies the workbench's status/rating/search filters while keeping the
 * input order (the server's createdAt-desc). Shared between the list view
 * and the detail page's next/previous stepper so both walk the exact same
 * sequence the user was looking at.
 */
export function filterApplicants(
  applicants: Applicant[],
  { status, rating, search }: ApplicantFilter
): Applicant[] {
  const q = search.trim().toLowerCase();
  return applicants.filter(a => {
    if (status !== "alle" && a.status !== status) return false;
    if (rating === "offen" && a.rating) return false;
    if (rating !== "alle" && rating !== "offen" && a.rating !== rating)
      return false;
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
}
