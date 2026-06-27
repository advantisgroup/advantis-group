import { type Infer } from "convex/values";

import { type Doc } from "../_generated/dataModel";
import { audienceValidator } from "../schema";

export type Audience = Infer<typeof audienceValidator>;

/** Does the given user fall within the target audience? */
export function userMatchesAudience(
  user: Doc<"users">,
  audience: Audience
): boolean {
  switch (audience.kind) {
    case "all":
      return true;
    case "department":
      return (
        !!user.department &&
        user.department.toLowerCase() === audience.department.toLowerCase()
      );
    case "users":
      return audience.userIds.some(id => id === user._id);
  }
}

/** Human-readable label for an audience (for UI / emails). */
export function audienceLabel(audience: Audience): string {
  switch (audience.kind) {
    case "all":
      return "Everyone";
    case "department":
      return `Department: ${audience.department}`;
    case "users":
      return `${audience.userIds.length} selected ${
        audience.userIds.length === 1 ? "person" : "people"
      }`;
  }
}
