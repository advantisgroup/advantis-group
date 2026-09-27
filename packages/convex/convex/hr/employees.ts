import { serverQuery, userQuery, userMutation } from "../functions";
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { profileDisplayName, profileOptionValidator, toProfileOption } from "../lib/profile";
import { onboardingItemValidator } from "../schema";

const employeeDocumentCategoryValidator = v.union(
  v.literal("documents"),
  v.literal("legal"),
  v.literal("payroll"),
  v.literal("contract"),
  v.literal("other"),
);

/**
 * `employeeProfiles` is HumanResources' subprofile: a feature-owned record
 * representing "this person, as an HR employee record," optionally linked
 * to an intranet `users` row via `userId`. See
 * `docs/architecture/profiles.md` for the Profile/Subprofile vocabulary.
 */
const employeeProfileValidator = v.object({
  _id: v.id("employeeProfiles"),
  _creationTime: v.number(),
  userId: v.optional(v.id("users")),
  sourceApplicantId: v.optional(v.id("applicants")),
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  jobTitle: v.optional(v.string()),
  department: v.optional(v.string()),
  status: v.union(v.literal("active"), v.literal("archived")),
  onboarding: v.optional(v.array(onboardingItemValidator)),
  notes: v.optional(v.string()),
  createdByUserId: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
  archivedAt: v.optional(v.number()),
});

async function requireProfile(
  ctx: QueryCtx | MutationCtx,
  employeeProfileId: Id<"employeeProfiles">,
): Promise<Doc<"employeeProfiles">> {
  const profile = await ctx.db.get(employeeProfileId);
  if (!profile) {
    throw new ConvexError({
      code: "not_found",
      message: "Employee profile not found",
    });
  }
  return profile;
}

function compact(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** One HR record per intranet account — a second one would split that
 * person's documents across two files with nothing saying which is real. */
async function requireLinkable(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  employeeProfileId?: Id<"employeeProfiles">,
): Promise<Doc<"users">> {
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError({ code: "not_found", message: "User not found" });
  const existing = await ctx.db
    .query("employeeProfiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (existing && existing._id !== employeeProfileId) {
    throw new ConvexError({
      code: "conflict",
      message: `Already linked to the HR record "${existing.name}"`,
    });
  }
  return user;
}

const emailKey = (email: string | undefined) => email?.trim().toLowerCase() || null;

export const listProfiles = userQuery({
  applicant: "access",
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(
    employeeProfileValidator.extend({
      linkedProfile: v.union(profileOptionValidator, v.null()),
      documentsCount: v.number(),
    }),
  ),
  handler: async (ctx, { includeArchived }) => {
    const profiles = includeArchived
      ? await ctx.db.query("employeeProfiles").withIndex("by_createdAt").order("desc").take(1000)
      : await ctx.db
          .query("employeeProfiles")
          .withIndex("by_status", (q) => q.eq("status", "active"))
          .order("desc")
          .take(1000);

    return Promise.all(
      profiles.map(async (profile) => {
        const documents = await ctx.db
          .query("employeeDocuments")
          .withIndex("by_employee", (q) => q.eq("employeeProfileId", profile._id))
          .collect();
        const user = profile.userId ? await ctx.db.get(profile.userId) : null;
        return {
          ...profile,
          linkedProfile: user ? await toProfileOption(ctx, user) : null,
          documentsCount: documents.length,
        };
      }),
    );
  },
});

/** Which intranet accounts already have an HR record, for the account
 * picker's "already has a record" hint. */
export const linkedAccounts = userQuery({
  applicant: "access",
  args: {},
  returns: v.array(
    v.object({
      userId: v.id("users"),
      employeeProfileId: v.id("employeeProfiles"),
      name: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const profiles = await ctx.db.query("employeeProfiles").take(2000);
    return profiles.flatMap((profile) =>
      profile.userId
        ? [{ userId: profile.userId, employeeProfileId: profile._id, name: profile.name }]
        : [],
    );
  },
});

/**
 * Active intranet members who don't have an HR record yet — what the import
 * page offers. An unlinked record with the same email is the same person
 * entered by hand earlier, so importing links that one instead of making a
 * second.
 */
export const backfillCandidates = userQuery({
  applicant: "access",
  args: {},
  returns: v.array(
    profileOptionValidator.extend({
      matchedEmployee: v.union(
        v.object({ _id: v.id("employeeProfiles"), name: v.string() }),
        v.null(),
      ),
    }),
  ),
  handler: async (ctx) => {
    const [users, profiles] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect(),
      ctx.db.query("employeeProfiles").take(2000),
    ]);
    const linked = new Set(profiles.flatMap((p) => (p.userId ? [p.userId] : [])));
    const unlinkedByEmail = new Map(
      profiles.flatMap((p) => {
        const key = emailKey(p.email);
        return !p.userId && key ? [[key, p] as const] : [];
      }),
    );
    const candidates = await Promise.all(
      users
        .filter((u) => !linked.has(u._id))
        .map(async (u) => {
          const match = unlinkedByEmail.get(u.email.toLowerCase());
          return {
            ...(await toProfileOption(ctx, u)),
            matchedEmployee: match ? { _id: match._id, name: match.name } : null,
          };
        }),
    );
    return candidates.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const backfillFromIntranet = userMutation({
  applicant: "access",
  args: { userIds: v.array(v.id("users")) },
  returns: v.object({ created: v.number(), linked: v.number() }),
  handler: async (ctx, { userIds }) => {
    if (userIds.length > 500) {
      throw new ConvexError({ code: "bad_request", message: "Too many people at once" });
    }
    const profiles = await ctx.db.query("employeeProfiles").take(2000);
    const linked = new Set(profiles.flatMap((p) => (p.userId ? [p.userId] : [])));
    const unlinkedByEmail = new Map(
      profiles.flatMap((p) => {
        const key = emailKey(p.email);
        return !p.userId && key ? [[key, p] as const] : [];
      }),
    );
    const now = Date.now();
    let created = 0;
    let linkedCount = 0;
    for (const userId of new Set(userIds)) {
      if (linked.has(userId)) continue;
      const user = await ctx.db.get(userId);
      if (!user || user.status !== "active") continue;
      const match = unlinkedByEmail.get(user.email.toLowerCase());
      if (match) {
        // Only fill gaps — whatever HR already typed into the record wins.
        await ctx.db.patch(match._id, {
          userId,
          phone: match.phone ?? user.phone,
          jobTitle: match.jobTitle ?? user.jobTitle,
          department: match.department ?? user.department,
          updatedAt: now,
        });
        unlinkedByEmail.delete(user.email.toLowerCase());
        linkedCount++;
      } else {
        await ctx.db.insert("employeeProfiles", {
          userId,
          name: profileDisplayName(user),
          email: user.email,
          phone: user.phone,
          jobTitle: user.jobTitle,
          department: user.department,
          status: "active",
          createdByUserId: ctx.caller.user._id,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }
      linked.add(userId);
    }
    return { created, linked: linkedCount };
  },
});

export const getProfile = userQuery({
  applicant: "access",
  args: { employeeProfileId: v.id("employeeProfiles") },
  returns: employeeProfileValidator.extend({
    linkedProfile: v.union(profileOptionValidator, v.null()),
    sourceApplicant: v.union(
      v.object({
        _id: v.id("applicants"),
        name: v.string(),
        archivedAt: v.union(v.number(), v.null()),
      }),
      v.null(),
    ),
  }),
  handler: async (ctx, { employeeProfileId }) => {
    const profile = await requireProfile(ctx, employeeProfileId);
    const linkedUser = profile.userId ? await ctx.db.get(profile.userId) : null;
    const sourceApplicant = profile.sourceApplicantId
      ? await ctx.db.get(profile.sourceApplicantId)
      : null;
    return {
      ...profile,
      linkedProfile: linkedUser ? await toProfileOption(ctx, linkedUser) : null,
      sourceApplicant: sourceApplicant
        ? {
            _id: sourceApplicant._id,
            name: sourceApplicant.name,
            archivedAt: sourceApplicant.archivedAt ?? null,
          }
        : null,
    };
  },
});

export const createProfile = userMutation({
  applicant: "access",
  args: {
    userId: v.optional(v.id("users")),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    department: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
    const name = compact(args.name);
    if (!name) throw new ConvexError({ code: "bad_request", message: "Name required" });
    if (args.userId) await requireLinkable(ctx, args.userId);
    const now = Date.now();
    return ctx.db.insert("employeeProfiles", {
      userId: args.userId,
      name,
      email: compact(args.email),
      phone: compact(args.phone),
      jobTitle: compact(args.jobTitle),
      department: compact(args.department),
      notes: compact(args.notes),
      status: "active",
      createdByUserId: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateProfile = userMutation({
  applicant: "access",
  args: {
    employeeProfileId: v.id("employeeProfiles"),
    userId: v.optional(v.union(v.id("users"), v.null())),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    department: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { employeeProfileId, userId, ...patch }) => {
    await requireProfile(ctx, employeeProfileId);
    if (userId) await requireLinkable(ctx, userId, employeeProfileId);
    await ctx.db.patch(employeeProfileId, {
      ...(userId !== undefined ? { userId: userId ?? undefined } : {}),
      ...(patch.name !== undefined ? { name: compact(patch.name) ?? "" } : {}),
      ...(patch.email !== undefined ? { email: compact(patch.email) } : {}),
      ...(patch.phone !== undefined ? { phone: compact(patch.phone) } : {}),
      ...(patch.jobTitle !== undefined ? { jobTitle: compact(patch.jobTitle) } : {}),
      ...(patch.department !== undefined ? { department: compact(patch.department) } : {}),
      ...(patch.notes !== undefined ? { notes: compact(patch.notes) } : {}),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const setOnboarding = userMutation({
  applicant: "access",
  args: {
    employeeProfileId: v.id("employeeProfiles"),
    items: v.array(onboardingItemValidator),
  },
  handler: async (ctx, { employeeProfileId, items }) => {
    await requireProfile(ctx, employeeProfileId);
    if (items.length > 40) {
      throw new ConvexError({ code: "bad_request", message: "Too many onboarding steps" });
    }
    await ctx.db.patch(employeeProfileId, { onboarding: items, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const archiveProfile = userMutation({
  applicant: "access",
  args: { employeeProfileId: v.id("employeeProfiles"), archived: v.boolean() },
  handler: async (ctx, { employeeProfileId, archived }) => {
    await requireProfile(ctx, employeeProfileId);
    await ctx.db.patch(employeeProfileId, {
      status: archived ? "archived" : "active",
      archivedAt: archived ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const convertApplicant = userMutation({
  applicant: "access",
  args: { applicantId: v.id("applicants"), userId: v.optional(v.id("users")) },
  handler: async (ctx, { applicantId, userId }) => {
    const user = ctx.caller.user;
    const applicant = await ctx.db.get(applicantId);
    if (!applicant)
      throw new ConvexError({
        code: "not_found",
        message: "Applicant not found",
      });
    if (applicant.convertedEmployeeProfileId) {
      return { employeeProfileId: applicant.convertedEmployeeProfileId };
    }
    if (userId) await requireLinkable(ctx, userId);
    const now = Date.now();
    const employeeProfileId = await ctx.db.insert("employeeProfiles", {
      userId,
      sourceApplicantId: applicantId,
      name: applicant.name,
      email: applicant.email,
      phone: applicant.telefon,
      jobTitle: applicant.position,
      notes: applicant.notizen,
      status: "active",
      createdByUserId: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(applicantId, {
      convertedEmployeeProfileId: employeeProfileId,
      archivedAt: now,
    });
    return { employeeProfileId };
  },
});

/**
 * Reverses `convertApplicant` — deletes the employee record it created and
 * puts the applicant back in the list. Hiring is one click next to Archive,
 * so a misclick is easy and there was no way back from it.
 *
 * Refuses once the record has picked up documents: at that point it isn't
 * the empty shell the conversion produced, and deleting it would take real
 * data with it. That's a manual call, not something to guess at here.
 */
export const revertConversion = userMutation({
  applicant: "access",
  args: { applicantId: v.id("applicants") },
  handler: async (ctx, { applicantId }) => {
    const applicant = await ctx.db.get(applicantId);
    if (!applicant)
      throw new ConvexError({
        code: "not_found",
        message: "Applicant not found",
      });
    const employeeProfileId = applicant.convertedEmployeeProfileId;
    if (!employeeProfileId)
      throw new ConvexError({
        code: "invalid",
        message: "Applicant was never converted",
      });

    const documents = await ctx.db
      .query("employeeDocuments")
      .withIndex("by_employee", (q) => q.eq("employeeProfileId", employeeProfileId))
      .first();
    if (documents)
      throw new ConvexError({
        code: "invalid",
        message: "Employee record already has documents",
      });

    await ctx.db.delete(employeeProfileId);
    await ctx.db.patch(applicantId, {
      convertedEmployeeProfileId: undefined,
      archivedAt: undefined,
    });
    return { ok: true };
  },
});

export const archiveApplicant = userMutation({
  applicant: "access",
  args: { applicantId: v.id("applicants") },
  handler: async (ctx, { applicantId }) => {
    const applicant = await ctx.db.get(applicantId);
    if (!applicant)
      throw new ConvexError({
        code: "not_found",
        message: "Applicant not found",
      });
    await ctx.db.patch(applicantId, { archivedAt: Date.now() });
    return { ok: true };
  },
});

/** New documents are OneDrive-backed — Convex only stores the reference
 * (see `employeeDocuments` in schema.ts). */
export const addDocument = userMutation({
  applicant: "access",
  args: {
    employeeProfileId: v.id("employeeProfiles"),
    oneDriveItemId: v.string(),
    oneDrivePath: v.string(),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    category: employeeDocumentCategoryValidator,
  },
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
    await requireProfile(ctx, args.employeeProfileId);
    return ctx.db.insert("employeeDocuments", {
      employeeProfileId: args.employeeProfileId,
      oneDriveItemId: args.oneDriveItemId,
      oneDrivePath: args.oneDrivePath,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      category: args.category,
      uploadedByUserId: user._id,
      createdAt: Date.now(),
    });
  },
});

export const listDocuments = userQuery({
  applicant: "access",
  args: { employeeProfileId: v.id("employeeProfiles") },
  handler: async (ctx, { employeeProfileId }) => {
    await requireProfile(ctx, employeeProfileId);
    const documents = await ctx.db
      .query("employeeDocuments")
      .withIndex("by_employee", (q) => q.eq("employeeProfileId", employeeProfileId))
      .collect();
    return Promise.all(
      documents
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (document) => {
          const uploader = await ctx.db.get(document.uploadedByUserId);
          return {
            ...document,
            uploadedByName: uploader ? profileDisplayName(uploader) : null,
            // Legacy (pre-OneDrive) rows only — null for anything uploaded
            // through the current attach flow, which resolves its own URL
            // through apps/api's /onedrive/download|preview endpoints.
            legacyUrl: document.storageId ? await ctx.storage.getUrl(document.storageId) : null,
          };
        }),
    );
  },
});

export const removeDocument = userMutation({
  applicant: "access",
  args: { documentId: v.id("employeeDocuments") },
  handler: async (ctx, { documentId }) => {
    const document = await ctx.db.get(documentId);
    if (!document) return { ok: true, oneDriveItemId: null };
    if (document.storageId) await ctx.storage.delete(document.storageId);
    await ctx.db.delete(documentId);
    return { ok: true, oneDriveItemId: document.oneDriveItemId ?? null };
  },
});

/** The folder name apps/api provisions this employee's OneDrive documents
 * under: Team/HR/<name> (<id>) — the id suffix keeps it unique even when two
 * employees share a name, without making the whole folder name opaque. */
function employeeFolderNameFor(profile: Doc<"employeeProfiles">): string {
  const cleanName = profile.name.replace(/[\\/:*?"<>|]/g, "").trim() || "Employee";
  return `${cleanName} (${profile._id.slice(-6)})`;
}

/** Clerk-authenticated — lets the documents page resolve its own OneDrive
 * folder path so it can list/browse it (the attach route resolves this
 * itself server-side too, via `apiEmployeeFolderName` below). */
export const employeeFolderName = userQuery({
  applicant: "access",
  args: { employeeProfileId: v.id("employeeProfiles") },
  handler: async (ctx, { employeeProfileId }) => {
    const profile = await requireProfile(ctx, employeeProfileId);
    return { folderName: employeeFolderNameFor(profile) };
  },
});

/** Server-key gated variant of `employeeFolderName`, for apps/api — never
 * trusts a client-supplied folder name for the actual upload path. */
export const apiEmployeeFolderName = serverQuery({
  args: { employeeProfileId: v.id("employeeProfiles") },
  handler: async (ctx, { employeeProfileId }) => {
    const profile = await ctx.db.get(employeeProfileId);
    if (!profile) {
      throw new ConvexError({ code: "not_found", message: "Employee profile not found" });
    }
    return { folderName: employeeFolderNameFor(profile) };
  },
});
