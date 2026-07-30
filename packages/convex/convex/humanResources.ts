import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  type QueryCtx,
  mutation,
  query,
} from "./_generated/server";
import { requireApplicantAccess } from "./lib/auth";

const employeeDocumentCategoryValidator = v.union(
  v.literal("documents"),
  v.literal("legal"),
  v.literal("payroll"),
  v.literal("contract"),
  v.literal("other")
);

async function requireProfile(
  ctx: QueryCtx | MutationCtx,
  employeeProfileId: Id<"employeeProfiles">
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

async function displayName(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  return user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
    : null;
}

export const listProfiles = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, { includeArchived }) => {
    await requireApplicantAccess(ctx);
    const profiles = includeArchived
      ? await ctx.db
          .query("employeeProfiles")
          .withIndex("by_createdAt")
          .order("desc")
          .take(1000)
      : await ctx.db
          .query("employeeProfiles")
          .withIndex("by_status", q => q.eq("status", "active"))
          .order("desc")
          .take(1000);

    return Promise.all(
      profiles.map(async profile => {
        const documents = await ctx.db
          .query("employeeDocuments")
          .withIndex("by_employee", q => q.eq("employeeProfileId", profile._id))
          .collect();
        const user = profile.userId ? await ctx.db.get(profile.userId) : null;
        return {
          ...profile,
          linkedUserName: user
            ? [user.firstName, user.lastName].filter(Boolean).join(" ") ||
              user.email
            : null,
          documentsCount: documents.length,
        };
      })
    );
  },
});

export const getProfile = query({
  args: { employeeProfileId: v.id("employeeProfiles") },
  handler: async (ctx, { employeeProfileId }) => {
    await requireApplicantAccess(ctx);
    const profile = await requireProfile(ctx, employeeProfileId);
    const linkedUser = profile.userId ? await ctx.db.get(profile.userId) : null;
    const sourceApplicant = profile.sourceApplicantId
      ? await ctx.db.get(profile.sourceApplicantId)
      : null;
    return {
      ...profile,
      linkedUserName: linkedUser
        ? [linkedUser.firstName, linkedUser.lastName]
            .filter(Boolean)
            .join(" ") || linkedUser.email
        : null,
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

export const createProfile = mutation({
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
    const user = await requireApplicantAccess(ctx);
    const name = compact(args.name);
    if (!name)
      throw new ConvexError({ code: "bad_request", message: "Name required" });
    if (args.userId) {
      const linked = await ctx.db.get(args.userId);
      if (!linked)
        throw new ConvexError({ code: "not_found", message: "User not found" });
    }
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

export const updateProfile = mutation({
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
    await requireApplicantAccess(ctx);
    await requireProfile(ctx, employeeProfileId);
    if (userId) {
      const linked = await ctx.db.get(userId);
      if (!linked)
        throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    await ctx.db.patch(employeeProfileId, {
      ...(userId !== undefined ? { userId: userId ?? undefined } : {}),
      ...(patch.name !== undefined ? { name: compact(patch.name) ?? "" } : {}),
      ...(patch.email !== undefined ? { email: compact(patch.email) } : {}),
      ...(patch.phone !== undefined ? { phone: compact(patch.phone) } : {}),
      ...(patch.jobTitle !== undefined
        ? { jobTitle: compact(patch.jobTitle) }
        : {}),
      ...(patch.department !== undefined
        ? { department: compact(patch.department) }
        : {}),
      ...(patch.notes !== undefined ? { notes: compact(patch.notes) } : {}),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const archiveProfile = mutation({
  args: { employeeProfileId: v.id("employeeProfiles"), archived: v.boolean() },
  handler: async (ctx, { employeeProfileId, archived }) => {
    await requireApplicantAccess(ctx);
    await requireProfile(ctx, employeeProfileId);
    await ctx.db.patch(employeeProfileId, {
      status: archived ? "archived" : "active",
      archivedAt: archived ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const convertApplicant = mutation({
  args: { applicantId: v.id("applicants"), userId: v.optional(v.id("users")) },
  handler: async (ctx, { applicantId, userId }) => {
    const user = await requireApplicantAccess(ctx);
    const applicant = await ctx.db.get(applicantId);
    if (!applicant)
      throw new ConvexError({
        code: "not_found",
        message: "Applicant not found",
      });
    if (applicant.convertedEmployeeProfileId) {
      return { employeeProfileId: applicant.convertedEmployeeProfileId };
    }
    if (userId) {
      const linked = await ctx.db.get(userId);
      if (!linked)
        throw new ConvexError({ code: "not_found", message: "User not found" });
    }
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

export const archiveApplicant = mutation({
  args: { applicantId: v.id("applicants") },
  handler: async (ctx, { applicantId }) => {
    await requireApplicantAccess(ctx);
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

export const addDocument = mutation({
  args: {
    employeeProfileId: v.id("employeeProfiles"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    category: employeeDocumentCategoryValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireApplicantAccess(ctx);
    await requireProfile(ctx, args.employeeProfileId);
    return ctx.db.insert("employeeDocuments", {
      employeeProfileId: args.employeeProfileId,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      category: args.category,
      uploadedByUserId: user._id,
      createdAt: Date.now(),
    });
  },
});

export const listDocuments = query({
  args: { employeeProfileId: v.id("employeeProfiles") },
  handler: async (ctx, { employeeProfileId }) => {
    await requireApplicantAccess(ctx);
    await requireProfile(ctx, employeeProfileId);
    const documents = await ctx.db
      .query("employeeDocuments")
      .withIndex("by_employee", q =>
        q.eq("employeeProfileId", employeeProfileId)
      )
      .collect();
    return Promise.all(
      documents
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async document => ({
          ...document,
          uploadedByName: await displayName(ctx, document.uploadedByUserId),
          url: await ctx.storage.getUrl(document.storageId),
        }))
    );
  },
});

export const removeDocument = mutation({
  args: { documentId: v.id("employeeDocuments") },
  handler: async (ctx, { documentId }) => {
    await requireApplicantAccess(ctx);
    const document = await ctx.db.get(documentId);
    if (!document) return { ok: true };
    await ctx.storage.delete(document.storageId);
    await ctx.db.delete(documentId);
    return { ok: true };
  },
});
