"use client";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";

/**
 * Fetches the applicant for the current `/hr/[id]/...` route. Shared by
 * every sub-resource layout under an applicant (Kontakte, Emails,
 * Interviews, Termine, Dokumente) so each doesn't repeat the
 * useParams+useQuery boilerplate.
 */
export function useApplicant(): ApplicantDetail | null | undefined {
  const params = useParams<{ id: string }>();
  const applicantId = params.id as Id<"applicants">;
  return useQuery(api.applicants.get, { applicantId });
}

type SubItemKey = "kontakte" | "emails" | "interviews" | "termine" | "documents";

/**
 * Fetches the applicant plus a single item from one of its array fields,
 * keyed by a route param — the shared shape behind every
 * `/hr/[id]/{kontakte,emails,interviews,termine,dokumente}/[itemId]`
 * detail page. Returns `null` while loading, or if the applicant or the
 * item itself isn't found (deleted, or a stale link).
 */
export function useApplicantSubItem<K extends SubItemKey>(
  itemsKey: K,
  idParam: string,
): { applicant: ApplicantDetail; item: ApplicantDetail[K][number] } | null {
  const params = useParams<Record<string, string>>();
  const applicant = useApplicant();
  if (!applicant) return null;

  const itemId = params[idParam];
  const items = applicant[itemsKey] as { _id: string }[];
  const item = items.find((i) => i._id === itemId);
  if (!item) return null;

  return { applicant, item: item as ApplicantDetail[K][number] };
}
