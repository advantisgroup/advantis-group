import { v } from "convex/values";

export const roleValidator = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("employee"),
);

/**
 * Scoped permissions a custom role (see `customRoles` table) can grant on top
 * of a user's base `role` tier. Additive only — a capability never revokes
 * anything the base tier already allows.
 */
export const capabilityValidator = v.union(
  v.literal("manage_members"),
  v.literal("access_integrations"),
  v.literal("access_files"),
  v.literal("manage_uploads"),
  v.literal("view_activity_admin"),
  v.literal("manage_announcements"),
  v.literal("manage_guidebooks"),
  v.literal("manage_blog"),
  v.literal("manage_it_ticket_threads"),
  v.literal("view_clockodo_team"),
  v.literal("manage_clockodo_team"),
  v.literal("use_ai"),
  v.literal("manage_inquiries"),
);

// --- Applicant Management (Bewerbermanagement) validators -------------------

export const ampelValidator = v.union(v.literal("rot"), v.literal("blau"), v.literal("gruen"));

export const kontaktArtValidator = v.union(
  v.literal("telefon"),
  v.literal("email"),
  v.literal("persoenlich"),
  v.literal("video"),
  v.literal("sonstiges"),
);

export const emailKategorieValidator = v.union(
  v.literal("telefonisch_nicht_erreicht"),
  v.literal("einladung"),
  v.literal("absage"),
  v.literal("sonstiges"),
);

export const terminArtValidator = v.union(
  v.literal("telefon"),
  v.literal("teams"),
  v.literal("vor_ort"),
);

export const terminTypValidator = v.union(
  v.literal("interview"),
  v.literal("gespraech"),
  v.literal("probetag"),
  v.literal("wiedervorlage"),
  v.literal("sonstiges"),
);

/** Who an event/announcement targets. */
export const audienceValidator = v.union(
  v.object({ kind: v.literal("all") }),
  v.object({ kind: v.literal("department"), department: v.string() }),
  v.object({
    kind: v.literal("departmentId"),
    departmentId: v.id("departments"),
  }),
  v.object({ kind: v.literal("users"), userIds: v.array(v.id("users")) }),
  /** Additive: reaches anyone in *any* of `departments` plus anyone listed
   *  individually in `userIds` — lets an author combine "Sales" with a couple
   *  of specific people from other departments in one audience. */
  v.object({
    kind: v.literal("mixed"),
    departments: v.array(v.string()),
    userIds: v.array(v.id("users")),
  }),
);

export const richDateKindValidator = v.union(
  v.literal("event"),
  v.literal("deadline"),
  v.literal("reminder"),
);

export const relevantDateValidator = v.object({
  id: v.optional(v.string()),
  startAt: v.number(),
  endAt: v.optional(v.number()),
  allDay: v.boolean(),
  kind: v.optional(richDateKindValidator),
  description: v.optional(v.string()),
  location: v.optional(v.string()),
});

export const attachmentValidator = v.object({
  storageId: v.id("_storage"),
  kind: v.union(v.literal("image"), v.literal("file")),
  name: v.string(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  size: v.optional(v.number()),
  contentType: v.optional(v.string()),
  /**
   * Present when this attachment was imported from OneDrive rather than
   * uploaded locally — the bytes are still copied into Convex storage (so the
   * attachment keeps working even if the drive file moves/is deleted), but
   * these let the UI show its origin and link back to the Files tab.
   */
  oneDriveItemId: v.optional(v.string()),
  oneDrivePath: v.optional(v.string()),
});

/** One step of an employee's first weeks. Built-in steps carry a `key` (the
 * label comes from translations); ones HR adds carry their own `label`. */
export const onboardingItemValidator = v.object({
  id: v.string(),
  key: v.optional(v.string()),
  label: v.optional(v.string()),
  doneAt: v.optional(v.number()),
});

export const suggestionStatusValidator = v.union(
  v.literal("open"),
  v.literal("in_discussion"),
  v.literal("implementing"),
  v.literal("closed"),
);

export const suggestionOutcomeValidator = v.union(
  v.literal("withdrawn"),
  v.literal("not_possible"),
  v.literal("implemented"),
);

/**
 * The areas guarded by a password of their own, outside Clerk — the `o=`
 * value in the shared `/password?o=<scope>&token=…` reset link, and the
 * discriminant on `passwordResetRequests`/`passwordResetTokens`. Add a new
 * literal here (plus a branch in `passwordResets.ts`'s `resolveTarget` /
 * `applyNewPassword`) when a third area grows its own password; nothing else
 * about the flow is per-area.
 */
export const passwordResetScopeValidator = v.union(v.literal("hr"), v.literal("performance"));

export const linkPreviewValidator = v.object({
  url: v.string(),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  image: v.optional(v.string()),
  siteName: v.optional(v.string()),
});
