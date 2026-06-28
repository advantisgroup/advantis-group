import type { Doc } from "../../_generated/dataModel";

/**
 * Best-effort human display name for an intranet user. ActivityTrack's `users`
 * had a single `name` field; the intranet splits it into first/last, so derive
 * a label and fall back to the email.
 */
export function displayName(user: Doc<"users">): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return full || user.email || "unknown";
}
