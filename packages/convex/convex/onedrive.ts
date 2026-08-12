import { sandboxedMutation as mutation } from "./lib/sandbox";
import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "./_generated/server";
import { internalAction, query } from "./_generated/server";
import {
  effectiveCustomRoleIds,
  effectiveRole,
  getUserByClerkId,
  hasApplicantAccess,
  isSandboxed,
  MANAGER_ROLES,
  requireCapability,
  requireUser,
} from "./lib/auth";
import { createNotification, notifyUsers } from "./lib/notify";
import { recordUnifiedAudit } from "./lib/auditLogWrite";
import { batchUserSummaries, displayName } from "./lib/users";

/**
 * OneDrive system-of-record. The Elysia API owns the Microsoft Graph credentials
 * and does all the byte-pushing; these functions persist the references, drive
 * the manager approval workflow, and expose reactive queries to the UI.
 *
 * Functions prefixed `api*` are server-key gated and only called by the API.
 * The rest are Clerk-authenticated and called straight from the intranet.
 */

function assertServerKey(serverKey: string): void {
  const expected = process.env.CONVEX_SERVER_KEY;
  if (!expected || serverKey !== expected) {
    throw new ConvexError({ code: "forbidden", message: "Invalid server key" });
  }
}

async function approverIds(ctx: MutationCtx): Promise<Id<"users">[]> {
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .collect();
  const managers = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "manager"))
    .collect();
  return [...admins, ...managers].filter((u) => u.status === "active").map((u) => u._id);
}

type OnedriveAuditAction =
  | "request"
  | "upload"
  | "approve"
  | "deny"
  | "mkdir"
  | "move"
  | "rename"
  | "delete"
  | "restore"
  | "share"
  | "grant_gf_access"
  | "revoke_gf_access"
  | "enable_uploads"
  | "disable_uploads"
  | "teamAccessGrant"
  | "teamAccessRevoke";

async function writeAudit(
  ctx: MutationCtx,
  actorUserId: Id<"users">,
  action: OnedriveAuditAction,
  target?: string,
): Promise<void> {
  const at = Date.now();
  await ctx.db.insert("onedriveAudit", {
    actorUserId,
    action,
    target,
    at,
  });
  await recordUnifiedAudit(ctx, {
    domain: "onedrive",
    actorUserId,
    action,
    target,
    at,
  });
}

// ===========================================================================
// Server-key gated — called by the Elysia API
// ===========================================================================

/** Resolve the intranet user behind a Clerk id, with OneDrive-relevant flags. */
export const apiUserContext = query({
  args: { serverKey: v.string(), clerkUserId: v.string() },
  handler: async (ctx, { serverKey, clerkUserId }) => {
    assertServerKey(serverKey);
    const user = await getUserByClerkId(ctx, clerkUserId);
    if (!user || user.status !== "active") return null;
    const sandboxed = isSandboxed(user);
    const role = effectiveRole(user);
    const customRoles = sandboxed
      ? []
      : await Promise.all(
          effectiveCustomRoleIds(user).map((customRoleId) => ctx.db.get(customRoleId)),
        );
    return {
      userId: user._id,
      role,
      name: displayName(user),
      email: user.email,
      gfAccess: sandboxed ? false : (user.gfAccess ?? false),
      uploadRequestsEnabled: user.uploadRequestsEnabled !== false,
      canAccessFiles:
        MANAGER_ROLES.includes(role) ||
        customRoles.some((customRole) => customRole?.capabilities.includes("access_files")),
      // Indirect permission: anyone who can manage wikis/HR gets write access
      // to that one OneDrive subtree (Team/Wiki, Team/HR) even without full
      // file-browser access — see apps/api's `access.ts` for the scoping.
      canWriteWiki:
        MANAGER_ROLES.includes(role) ||
        customRoles.some((customRole) => customRole?.capabilities.includes("manage_guidebooks")),
      canWriteHR: !sandboxed && hasApplicantAccess(user),
    };
  },
});

/** A one-shot URL the API POSTs staged bytes to (Convex file storage). */
export const apiGenerateStagingUrl = mutation({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    return ctx.storage.generateUploadUrl();
  },
});

/** Create a pending upload request (employee path). */
export const apiSubmitRequest = mutation({
  args: {
    serverKey: v.string(),
    requesterUserId: v.id("users"),
    fileName: v.string(),
    size: v.number(),
    contentType: v.string(),
    targetFolderPath: v.string(),
    stagingStorageId: v.id("_storage"),
    scanReport: v.string(),
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const requester = await ctx.db.get(args.requesterUserId);
    if (!requester) {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    const uploadId = await ctx.db.insert("onedriveUploads", {
      requesterUserId: args.requesterUserId,
      fileName: args.fileName,
      size: args.size,
      contentType: args.contentType,
      targetFolderPath: args.targetFolderPath,
      stagingStorageId: args.stagingStorageId,
      scanReport: args.scanReport,
      status: "pending",
      createdAt: Date.now(),
    });
    await writeAudit(ctx, args.requesterUserId, "request", args.fileName);
    await notifyUsers(ctx, await approverIds(ctx), {
      type: "upload_request",
      title: "Upload awaiting approval",
      body: `${displayName(requester)} wants to upload "${args.fileName}" to ${args.targetFolderPath || "Advantis Group"}`,
      link: `/admin/uploads?upload=${uploadId}`,
    });
    return { uploadId };
  },
});

/** Record a manager's direct upload (no approval needed). */
export const apiRecordDirectUpload = mutation({
  args: {
    serverKey: v.string(),
    uploaderUserId: v.id("users"),
    fileName: v.string(),
    size: v.number(),
    contentType: v.string(),
    targetFolderPath: v.string(),
    driveItemId: v.string(),
    scanReport: v.string(),
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const uploadId = await ctx.db.insert("onedriveUploads", {
      requesterUserId: args.uploaderUserId,
      fileName: args.fileName,
      size: args.size,
      contentType: args.contentType,
      targetFolderPath: args.targetFolderPath,
      scanReport: args.scanReport,
      status: "approved",
      driveItemId: args.driveItemId,
      reviewedByUserId: args.uploaderUserId,
      reviewedAt: Date.now(),
      createdAt: Date.now(),
    });
    await writeAudit(ctx, args.uploaderUserId, "upload", args.fileName);
    return { uploadId };
  },
});

/** Fetch a single upload + a fresh staging-blob URL (for the approve flow). */
export const apiGetUpload = query({
  args: { serverKey: v.string(), uploadId: v.id("onedriveUploads") },
  handler: async (ctx, { serverKey, uploadId }) => {
    assertServerKey(serverKey);
    const upload = await ctx.db.get(uploadId);
    if (!upload) return null;
    const stagingUrl = upload.stagingStorageId
      ? await ctx.storage.getUrl(upload.stagingStorageId)
      : null;
    return { upload, stagingUrl };
  },
});

/** Move a pending upload into the "uploading" state during approval. */
export const apiMarkUploading = mutation({
  args: { serverKey: v.string(), uploadId: v.id("onedriveUploads") },
  handler: async (ctx, { serverKey, uploadId }) => {
    assertServerKey(serverKey);
    await ctx.db.patch(uploadId, { status: "uploading", error: undefined });
    return { ok: true };
  },
});

async function notifyDecision(
  ctx: MutationCtx,
  upload: Doc<"onedriveUploads">,
  decision: "approved" | "denied",
  note: string | undefined,
): Promise<void> {
  const requester = await ctx.db.get(upload.requesterUserId);
  if (!requester) return;
  await createNotification(ctx, {
    userId: requester._id,
    type: "upload_decision",
    title: `Upload ${decision}`,
    body: `"${upload.fileName}" was ${decision}${note ? `: ${note}` : ""}`,
    link: "/files",
  });
  await ctx.scheduler.runAfter(0, internal.outbound.sendNotificationEmail, {
    kind: "upload-decision",
    to: requester.email,
    data: {
      decision,
      fileName: upload.fileName,
      folder: upload.targetFolderPath,
      note: note ?? "",
    },
  });
}

/** Finalise an approved upload once its bytes are in OneDrive. */
export const apiMarkApproved = mutation({
  args: {
    serverKey: v.string(),
    uploadId: v.id("onedriveUploads"),
    reviewerUserId: v.id("users"),
    driveItemId: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const upload = await ctx.db.get(args.uploadId);
    if (!upload) {
      throw new ConvexError({ code: "not_found", message: "Upload not found" });
    }
    if (upload.stagingStorageId) {
      await ctx.storage.delete(upload.stagingStorageId);
    }
    await ctx.db.patch(args.uploadId, {
      status: "approved",
      driveItemId: args.driveItemId,
      reviewedByUserId: args.reviewerUserId,
      reviewedAt: Date.now(),
      decisionNote: args.note,
      stagingStorageId: undefined,
      error: undefined,
    });
    await writeAudit(ctx, args.reviewerUserId, "approve", upload.fileName);
    await notifyDecision(ctx, upload, "approved", args.note);
    return { ok: true };
  },
});

/** Deny a pending upload — discard the staged bytes, notify the requester. */
export const apiMarkDenied = mutation({
  args: {
    serverKey: v.string(),
    uploadId: v.id("onedriveUploads"),
    reviewerUserId: v.id("users"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const upload = await ctx.db.get(args.uploadId);
    if (!upload) {
      throw new ConvexError({ code: "not_found", message: "Upload not found" });
    }
    if (upload.stagingStorageId) {
      await ctx.storage.delete(upload.stagingStorageId);
    }
    await ctx.db.patch(args.uploadId, {
      status: "denied",
      reviewedByUserId: args.reviewerUserId,
      reviewedAt: Date.now(),
      decisionNote: args.note,
      stagingStorageId: undefined,
    });
    await writeAudit(ctx, args.reviewerUserId, "deny", upload.fileName);
    await notifyDecision(ctx, upload, "denied", args.note);
    return { ok: true };
  },
});

/** Mark an approved-but-failed upload; keep the staged bytes for a retry. */
export const apiMarkFailed = mutation({
  args: {
    serverKey: v.string(),
    uploadId: v.id("onedriveUploads"),
    error: v.string(),
  },
  handler: async (ctx, { serverKey, uploadId, error }) => {
    assertServerKey(serverKey);
    await ctx.db.patch(uploadId, { status: "failed", error });
    return { ok: true };
  },
});

/** Record a OneDrive action (delete/mkdir/rename/move/share/restore) for audit. */
export const apiRecordAction = mutation({
  args: {
    serverKey: v.string(),
    actorUserId: v.id("users"),
    action: v.union(
      v.literal("mkdir"),
      v.literal("move"),
      v.literal("rename"),
      v.literal("delete"),
      v.literal("restore"),
      v.literal("share"),
    ),
    target: v.optional(v.string()),
  },
  handler: async (ctx, { serverKey, actorUserId, action, target }) => {
    assertServerKey(serverKey);
    await writeAudit(ctx, actorUserId, action, target);
    return { ok: true };
  },
});

/**
 * Read the stored (encrypted) delegated refresh token, or null. The API holds
 * the encryption key; Convex only ever sees ciphertext.
 */
export const apiGetRefreshToken = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const row = await ctx.db.query("onedriveAuth").first();
    return row ? { refreshToken: row.refreshToken } : null;
  },
});

/** Upsert the rotating (encrypted) delegated refresh token. */
export const apiSetRefreshToken = mutation({
  args: { serverKey: v.string(), refreshToken: v.string() },
  handler: async (ctx, { serverKey, refreshToken }) => {
    assertServerKey(serverKey);
    const row = await ctx.db.query("onedriveAuth").first();
    if (row) {
      await ctx.db.patch(row._id, { refreshToken, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("onedriveAuth", {
        refreshToken,
        updatedAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

/** Map driveItem ids → uploader display names, for the file browser. */
export const apiUploadersByItemIds = query({
  args: { serverKey: v.string(), itemIds: v.array(v.string()) },
  handler: async (ctx, { serverKey, itemIds }) => {
    assertServerKey(serverKey);
    const out: Record<string, string> = {};
    for (const itemId of itemIds) {
      const row = await ctx.db
        .query("onedriveUploads")
        .withIndex("by_driveItemId", (q) => q.eq("driveItemId", itemId))
        .first();
      if (!row) continue;
      const u = await ctx.db.get(row.requesterUserId);
      if (u) out[itemId] = displayName(u);
    }
    return out;
  },
});

/** Active employees plus their direct Team-folder share status, for the
 * admin "Team folder access" panel. */
export const apiTeamAccessRoster = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const users = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    return users
      .map((u) => ({
        userId: u._id,
        name: displayName(u),
        email: u.email,
        permissionId: u.oneDrivePermissionId ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Record a granted direct share (after a successful Graph invite). */
export const apiSetTeamAccess = mutation({
  args: {
    serverKey: v.string(),
    actorUserId: v.id("users"),
    targetUserId: v.id("users"),
    permissionId: v.string(),
  },
  handler: async (ctx, { serverKey, actorUserId, targetUserId, permissionId }) => {
    assertServerKey(serverKey);
    const target = await ctx.db.get(targetUserId);
    await ctx.db.patch(targetUserId, { oneDrivePermissionId: permissionId });
    await writeAudit(ctx, actorUserId, "teamAccessGrant", target ? displayName(target) : undefined);
    return { ok: true };
  },
});

/** Clear a revoked direct share (after a successful Graph removal). */
export const apiClearTeamAccess = mutation({
  args: {
    serverKey: v.string(),
    actorUserId: v.id("users"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, { serverKey, actorUserId, targetUserId }) => {
    assertServerKey(serverKey);
    const target = await ctx.db.get(targetUserId);
    await ctx.db.patch(targetUserId, { oneDrivePermissionId: undefined });
    await writeAudit(
      ctx,
      actorUserId,
      "teamAccessRevoke",
      target ? displayName(target) : undefined,
    );
    return { ok: true };
  },
});

// ===========================================================================
// Client-facing — Clerk authenticated
// ===========================================================================

/**
 * Pending approval queue for the admin panel (newest first). Manager+, or an
 * employee whose custom role grants `manage_uploads`.
 */
export const listPending = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "manage_uploads");
    const rows = await ctx.db
      .query("onedriveUploads")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(200);
    return Promise.all(
      rows.map(async (row) => {
        const requester = await ctx.db.get(row.requesterUserId);
        const previewUrl = row.stagingStorageId
          ? await ctx.storage.getUrl(row.stagingStorageId)
          : null;
        return {
          ...row,
          requesterName: requester ? displayName(requester) : "unknown",
          previewUrl,
        };
      }),
    );
  },
});

/** The signed-in user's own upload history / request statuses. */
export const myUploads = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return ctx.db
      .query("onedriveUploads")
      .withIndex("by_user", (q) => q.eq("requesterUserId", user._id))
      .order("desc")
      .take(100);
  },
});

/**
 * OneDrive audit feed (who did what), newest first. Manager+, or an employee
 * whose custom role grants `manage_uploads`.
 */
export const auditFeed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await requireCapability(ctx, "manage_uploads");
    const rows = await ctx.db
      .query("onedriveAudit")
      .withIndex("by_at")
      .order("desc")
      .take(Math.min(limit ?? 100, 500));
    const byId = await batchUserSummaries(
      ctx,
      rows.map((r) => r.actorUserId),
    );
    return rows.map((row) => ({
      ...row,
      user: byId.get(row.actorUserId) ?? null,
    }));
  },
});

/** Requester cancels their own still-pending upload request. */
export const cancelRequest = mutation({
  args: { uploadId: v.id("onedriveUploads") },
  handler: async (ctx, { uploadId }) => {
    const user = await requireUser(ctx);
    const upload = await ctx.db.get(uploadId);
    if (!upload || upload.requesterUserId !== user._id) {
      throw new ConvexError({
        code: "not_found",
        message: "Request not found",
      });
    }
    if (upload.status !== "pending") {
      throw new ConvexError({
        code: "bad_request",
        message: "Only pending requests can be cancelled",
      });
    }
    if (upload.stagingStorageId) {
      await ctx.storage.delete(upload.stagingStorageId);
    }
    await ctx.db.patch(uploadId, {
      status: "cancelled",
      stagingStorageId: undefined,
    });
    return { ok: true };
  },
});

// ===========================================================================
// Maintenance — keep the Graph change-notification subscription alive
// ===========================================================================

/**
 * Ask the Elysia API to (re)create the OneDrive change-notification
 * subscription that keeps the listing cache fresh. Scheduled daily from crons;
 * a no-op when the API isn't configured (same shape as `outbound.ts`).
 */
export const renewSubscription = internalAction({
  args: {},
  handler: async () => {
    const baseUrl = process.env.API_INTERNAL_URL ?? process.env.API_URL;
    const serverKey = process.env.CONVEX_SERVER_KEY;
    if (!baseUrl || !serverKey) {
      console.warn("[onedrive] subscription renewal skipped — API not configured");
      return { ok: false };
    }
    try {
      const res = await fetch(`${baseUrl}/internal/onedrive/subscribe`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-convex-server-key": serverKey,
        },
        body: "{}",
      });
      if (!res.ok) {
        console.error(`[onedrive] subscription renewal failed: ${res.status}`);
        return { ok: false };
      }
      return { ok: true };
    } catch (error) {
      console.error("[onedrive] subscription renewal error:", error);
      return { ok: false };
    }
  },
});

// QueryCtx is imported for type-only symmetry with other modules.
export type { QueryCtx };
