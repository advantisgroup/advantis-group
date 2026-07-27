import { type Infer } from "convex/values";

import { type Doc } from "../_generated/dataModel";
import { audienceValidator } from "../schema";

export type Audience = Infer<typeof audienceValidator>;

/** Does the given user fall within the target audience? */
export function userMatchesAudience(user: Doc<"users">, audience: Audience): boolean {
  switch (audience.kind) {
    case "all":
      return true;
    case "department":
      return (
        !!user.department && user.department.toLowerCase() === audience.department.toLowerCase()
      );
    case "departmentId":
      return user.departmentId === audience.departmentId;
    case "users":
      return audience.userIds.some((id) => id === user._id);
  }
}

/**
 * Human-readable label for an audience (for UI / emails). The `departmentId`
 * case can't resolve a department name without a DB lookup — callers on that
 * path should resolve the name themselves via `ctx.db.get(departmentId)`
 * once the org-data migration's read paths cut over (see `orgDataMigration`).
 */
export function audienceLabel(audience: Audience): string {
  switch (audience.kind) {
    case "all":
      return "Everyone";
    case "department":
      return `Department: ${audience.department}`;
    case "departmentId":
      return "Department";
    case "users":
      return `${audience.userIds.length} selected ${
        audience.userIds.length === 1 ? "person" : "people"
      }`;
  }
}
