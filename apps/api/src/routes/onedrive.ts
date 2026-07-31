import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type OneDriveBreadcrumb, type OneDriveItem, type OneDriveListing } from "../lib/types.js";
import { Elysia, t } from "elysia";

import { getConvex, getConvexServerKey } from "../lib/convex.js";
import { Errors } from "../lib/errors.js";
import {
  assertCanRead,
  assertCanWrite,
  assertWithinBrowsableScope,
  classifyAccess,
  folderConfig,
  hrFolderBase,
  isWithinBrowsableScope,
  normalizePath,
  wikiFolderBase,
} from "../lib/onedrive/access.js";
import { getCachedListing, invalidateAll, setCachedListing } from "../lib/onedrive/cache.js";
import {
  type OneDriveUser,
  requireFileBrowserAccess,
  requireManagerUser,
  resolveOneDriveUser,
} from "../lib/onedrive/context.js";
import {
  createFolder,
  createShareLink,
  deleteById,
  downloadById,
  getItemById,
  getItemByPath,
  getPreviewUrl,
  getQuota,
  getThumbnailUrl,
  findPermissionByEmail,
  type GraphItem,
  inviteToItem,
  isConfigured,
  listChildrenById,
  listVersions,
  relPathOf,
  removePermission,
  renameOrMove,
  restoreVersion,
  search,
  uploadFile,
} from "../lib/onedrive/graph.js";
import { scanFile } from "../lib/onedrive/scan.js";
import { ensureFolderPath } from "../lib/onedrive/provisionFolder.js";
import { rateLimit } from "../lib/rate-limit.js";

// --- helpers ----------------------------------------------------------------

const serverKey = () => getConvexServerKey();

/** A user-chosen subfolder under a wiki/HR attach base — collapsed to a
 * clean relative path with no `.`/`..` segments, so it can never climb out
 * of the base it's appended to. */
function sanitizeRelativeSubfolder(input?: string): string {
  if (!input) return "";
  return input
    .split("/")
    .map((seg) => seg.trim())
    .filter((seg) => seg.length > 0 && seg !== "." && seg !== "..")
    .join("/");
}

function toItem(child: GraphItem, user: OneDriveUser): OneDriveItem | null {
  const rel = relPathOf(child);
  if (rel === null) return null;
  const access = classifyAccess(user, rel);
  if (!access.canRead) return null; // hide what the viewer may not see
  const isFolder = Boolean(child.folder);
  return {
    id: child.id,
    name: child.name,
    type: isFolder ? "folder" : "file",
    size: child.size ?? 0,
    lastModified: child.lastModifiedDateTime,
    mimeType: child.file?.mimeType,
    childCount: child.folder?.childCount,
    path: rel,
    canWrite: access.canWrite,
  };
}

function breadcrumbs(relPath: string): OneDriveBreadcrumb[] {
  const crumbs: OneDriveBreadcrumb[] = [{ id: "", name: "Advantis Group", path: "" }];
  let acc = "";
  for (const seg of normalizePath(relPath).split("/").filter(Boolean)) {
    acc = acc ? `${acc}/${seg}` : seg;
    crumbs.push({ id: acc, name: seg, path: acc });
  }
  return crumbs;
}

async function buildListing(user: OneDriveUser, relPath: string): Promise<OneDriveListing> {
  let folder = await getItemByPath(relPath);
  let folderRel = relPathOf(folder) ?? normalizePath(relPath);
  assertCanRead(user, folderRel);
  assertWithinBrowsableScope(user, folderRel);

  // A deep link (e.g. a chat/announcement attachment) can point straight at
  // a file rather than a folder — list its parent instead and flag the file
  // itself so the client opens a preview once the listing has loaded.
  let previewItem: OneDriveItem | undefined;
  if (!folder.folder) {
    previewItem = toItem(folder, user) ?? undefined;
    const parentRel = folderRel.includes("/") ? folderRel.slice(0, folderRel.lastIndexOf("/")) : "";
    folder = await getItemByPath(parentRel);
    folderRel = relPathOf(folder) ?? normalizePath(parentRel);
    assertCanRead(user, folderRel);
    assertWithinBrowsableScope(user, folderRel);
  }

  const scope = `${user.role}:${user.gfAccess ? 1 : 0}`;
  const cacheKey = folderRel || "root";
  const cached = await getCachedListing<OneDriveListing>(cacheKey, scope);
  if (cached) return previewItem ? { ...cached, previewItem } : cached;

  const children = await listChildrenById(folder.id);
  const items: OneDriveItem[] = [];
  for (const child of children) {
    const item = toItem(child, user);
    if (item) items.push(item);
  }

  // Best-effort: annotate files with who uploaded them (tracked in Convex).
  try {
    const fileIds = items.filter((i) => i.type === "file").map((i) => i.id);
    if (fileIds.length > 0) {
      const map = await getConvex().query(api.onedrive.apiUploadersByItemIds, {
        serverKey: serverKey(),
        itemIds: fileIds,
      });
      for (const item of items) {
        const name = map[item.id];
        if (name) item.uploadedByName = name;
      }
    }
  } catch (error) {
    console.error("[onedrive] uploader lookup failed:", error);
  }

  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const access = classifyAccess(user, folderRel);
  const listing: OneDriveListing = {
    folderId: folder.id,
    path: folderRel,
    breadcrumbs: breadcrumbs(folderRel),
    items,
    canWrite: access.canWrite,
    canRequest: access.canRequest,
  };
  await setCachedListing(cacheKey, scope, listing);
  return previewItem ? { ...listing, previewItem } : listing;
}

/** Resolve a drive item id, ensure the user may read it, return its rel path. */
async function readableItem(
  user: OneDriveUser,
  id: string,
): Promise<{ item: GraphItem; rel: string }> {
  const item = await getItemById(id);
  const rel = relPathOf(item);
  if (rel === null) throw Errors.notFound("File not found");
  assertCanRead(user, rel);
  return { item, rel };
}

// --- routes -----------------------------------------------------------------

export const onedriveRoute = new Elysia({ prefix: "/onedrive" })
  // Whether OneDrive credentials are configured — lets the UI show a friendly
  // "not set up yet" state instead of failing every call. No Graph call.
  .get("/status", async ({ request }) => {
    const user = await resolveOneDriveUser(request);
    requireFileBrowserAccess(user);
    return { configured: await isConfigured() };
  })

  // List a folder (defaults to the Advantis Group root).
  .get(
    "/items",
    async ({ request, query }) => {
      const user = await resolveOneDriveUser(request);
      requireFileBrowserAccess(user);
      await rateLimit("od.list", user.clerkUserId, 60, "1 m");
      return buildListing(user, query.path ?? "");
    },
    { query: t.Object({ path: t.Optional(t.String()) }) },
  )

  // Drive storage usage — powers the 1 TB quota bar.
  .get("/quota", async ({ request }) => {
    const user = await resolveOneDriveUser(request);
    requireFileBrowserAccess(user);
    await rateLimit("od.quota", user.clerkUserId, 30, "1 m");
    return getQuota();
  })

  // Filename/content search, scoped to what the viewer may see.
  .get(
    "/search",
    async ({ request, query }) => {
      const user = await resolveOneDriveUser(request);
      requireFileBrowserAccess(user);
      await rateLimit("od.search", user.clerkUserId, 30, "1 m");
      const q = query.q.trim();
      if (q.length < 1) return { items: [] };
      const hits = await search(q);
      const items = hits
        .map((hit) => toItem(hit, user))
        .filter((i): i is OneDriveItem => i !== null)
        .filter((i) => isWithinBrowsableScope(user, i.path));
      return { items };
    },
    { query: t.Object({ q: t.String() }) },
  )

  // A short-lived preview/thumbnail URL for in-app viewing.
  .get(
    "/preview/:id",
    async ({ request, params }) => {
      const user = await resolveOneDriveUser(request);
      await readableItem(user, params.id);
      const [previewUrl, thumbnailUrl] = await Promise.all([
        getPreviewUrl(params.id).catch(() => undefined),
        getThumbnailUrl(params.id),
      ]);
      if (!previewUrl && !thumbnailUrl) {
        throw Errors.notFound("No preview available");
      }
      return { previewUrl, thumbnailUrl };
    },
    { params: t.Object({ id: t.String() }) },
  )

  // Stream a file's bytes back through the API (never exposes the drive).
  .get(
    "/download/:id",
    async ({ request, params }) => {
      const user = await resolveOneDriveUser(request);
      await rateLimit("od.download", user.clerkUserId, 120, "1 m");
      const { item } = await readableItem(user, params.id);
      const res = await downloadById(params.id);
      return new Response(res.body, {
        headers: {
          "content-type": item.file?.mimeType ?? "application/octet-stream",
          "content-disposition": `attachment; filename="${encodeURIComponent(item.name)}"`,
        },
      });
    },
    { params: t.Object({ id: t.String() }) },
  )

  // Import a file straight into Convex storage (Graph -> API -> Convex),
  // skipping the browser download-then-reupload round trip a client-side
  // picker would otherwise need. Returns a ready-to-use attachment payload
  // for chat/announcements.
  .post(
    "/import/:id",
    async ({ request, params }) => {
      const user = await resolveOneDriveUser(request);
      requireFileBrowserAccess(user);
      await rateLimit("od.import", user.clerkUserId, 30, "1 m");
      const { item, rel } = await readableItem(user, params.id);

      const res = await downloadById(params.id);
      const bytes = await res.arrayBuffer();
      const contentType = item.file?.mimeType || "application/octet-stream";

      const uploadUrl = await getConvex().mutation(api.files.apiGenerateUploadUrl, {
        serverKey: serverKey(),
      });
      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: { "content-type": contentType },
        body: bytes,
      });
      if (!uploadRes.ok) throw Errors.internal("Failed to import file");
      const { storageId } = (await uploadRes.json()) as { storageId: string };

      return {
        storageId,
        kind: contentType.startsWith("image/") ? ("image" as const) : ("file" as const),
        name: item.name,
        size: item.size ?? bytes.byteLength,
        contentType,
        oneDriveItemId: item.id,
        oneDrivePath: rel,
      };
    },
    { params: t.Object({ id: t.String() }) },
  )

  // Upload. Manager+ → straight to OneDrive; employee → staged pending request.
  .post(
    "/uploads",
    async ({ request, body }) => {
      const user = await resolveOneDriveUser(request);
      requireFileBrowserAccess(user);
      await rateLimit("od.upload", user.clerkUserId, 20, "1 h");

      const file = body.file;
      const targetRel = normalizePath(body.path ?? "");
      const access = classifyAccess(user, targetRel);
      if (!access.canWrite && !access.canRequest) {
        throw Errors.forbidden("You cannot upload to this folder");
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const scanPromise = scanFile({
        bytes,
        fileName: file.name,
        declaredMime: file.type,
      });

      // Manager / admin: write directly, record the reference. The scan and
      // the destination-folder lookup are independent Graph/CPU work, so run
      // them concurrently instead of paying for both round trips serially —
      // the rare "scan blocked" case just wastes one harmless GET.
      if (access.canWrite) {
        const [report, folder] = await Promise.all([scanPromise, getItemByPath(targetRel)]);
        if (report.verdict === "blocked") {
          const reason = report.flags.find((f) => f.severity === "danger");
          throw Errors.badRequest(reason?.detail ?? "This file type is not allowed");
        }
        const created = await uploadFile(folder.id, file.name, bytes, file.type);
        await getConvex().mutation(api.onedrive.apiRecordDirectUpload, {
          serverKey: serverKey(),
          uploaderUserId: user.userId,
          fileName: file.name,
          size: bytes.byteLength,
          contentType: file.type || "application/octet-stream",
          targetFolderPath: targetRel,
          driveItemId: created.id,
          scanReport: JSON.stringify(report),
        });
        await invalidateAll();
        return { status: "uploaded" as const, scan: report };
      }

      // Employee: stage the bytes in Convex and open an approval request.
      const report = await scanPromise;
      if (report.verdict === "blocked") {
        const reason = report.flags.find((f) => f.severity === "danger");
        throw Errors.badRequest(reason?.detail ?? "This file type is not allowed");
      }
      const scanJson = JSON.stringify(report);
      const uploadUrl = await getConvex().mutation(api.onedrive.apiGenerateStagingUrl, {
        serverKey: serverKey(),
      });
      const staged = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "content-type": file.type || "application/octet-stream",
        },
        body: bytes,
      });
      if (!staged.ok) {
        console.error("[onedrive] staging upload failed:", staged.status);
        throw Errors.internal("Could not stage the file for review");
      }
      const { storageId } = (await staged.json()) as {
        storageId: Id<"_storage">;
      };
      const { uploadId } = await getConvex().mutation(api.onedrive.apiSubmitRequest, {
        serverKey: serverKey(),
        requesterUserId: user.userId,
        fileName: file.name,
        size: bytes.byteLength,
        contentType: file.type || "application/octet-stream",
        targetFolderPath: targetRel,
        stagingStorageId: storageId,
        scanReport: scanJson,
      });
      return { status: "pending" as const, uploadId, scan: report };
    },
    {
      body: t.Object({
        file: t.File(),
        path: t.Optional(t.String()),
      }),
    },
  )

  // Approve a pending upload: stream the staged bytes into OneDrive.
  .post(
    "/uploads/:id/approve",
    async ({ request, params, body }) => {
      const user = await resolveOneDriveUser(request);
      requireManagerUser(user);
      const uploadId = params.id as Id<"onedriveUploads">;

      const found = await getConvex().query(api.onedrive.apiGetUpload, {
        serverKey: serverKey(),
        uploadId,
      });
      if (!found?.upload || found.upload.status !== "pending") {
        throw Errors.notFound("No pending upload");
      }
      const upload = found.upload;
      // A manager still needs write-access to the destination (e.g. gfAccess).
      assertCanWrite(user, upload.targetFolderPath);

      await getConvex().mutation(api.onedrive.apiMarkUploading, {
        serverKey: serverKey(),
        uploadId,
      });
      try {
        if (!found.stagingUrl) {
          throw Errors.internal("Staged file is no longer available");
        }
        const staged = await fetch(found.stagingUrl);
        if (!staged.ok) throw Errors.internal("Could not read staged file");
        const bytes = new Uint8Array(await staged.arrayBuffer());
        const folder = await getItemByPath(upload.targetFolderPath);
        const created = await uploadFile(folder.id, upload.fileName, bytes, upload.contentType);
        await getConvex().mutation(api.onedrive.apiMarkApproved, {
          serverKey: serverKey(),
          uploadId,
          reviewerUserId: user.userId,
          driveItemId: created.id,
          note: body?.note,
        });
        await invalidateAll();
        return { ok: true as const };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed";
        await getConvex().mutation(api.onedrive.apiMarkFailed, {
          serverKey: serverKey(),
          uploadId,
          error: message,
        });
        throw error;
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Optional(t.Object({ note: t.Optional(t.String()) })),
    },
  )

  // Deny a pending upload: discard the staged bytes, notify the requester.
  .post(
    "/uploads/:id/deny",
    async ({ request, params, body }) => {
      const user = await resolveOneDriveUser(request);
      requireManagerUser(user);
      await getConvex().mutation(api.onedrive.apiMarkDenied, {
        serverKey: serverKey(),
        uploadId: params.id as Id<"onedriveUploads">,
        reviewerUserId: user.userId,
        note: body?.note,
      });
      return { ok: true as const };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Optional(t.Object({ note: t.Optional(t.String()) })),
    },
  )

  // Create a folder (manager+).
  .post(
    "/folders",
    async ({ request, body }) => {
      const user = await resolveOneDriveUser(request);
      requireFileBrowserAccess(user);
      const targetRel = normalizePath(body.path ?? "");
      assertCanWrite(user, targetRel);
      const parent = await getItemByPath(targetRel);
      const created = await createFolder(parent.id, body.name.trim());
      await recordAction(user, "mkdir", `${targetRel}/${body.name}`);
      await invalidateAll();
      return { id: created.id, name: created.name };
    },
    { body: t.Object({ path: t.Optional(t.String()), name: t.String() }) },
  )

  // Upload a guidebook (wiki) attachment. Write-gated by `assertCanWrite`,
  // which now also admits a non-manager wiki editor via the indirect
  // Team/Wiki grant (see access.ts). Lazily provisions Team/Wiki/<slug>[/<folder>]
  // — Convex only ever stores the returned driveItemId/path as a reference,
  // never the bytes, so the file lives in OneDrive as its single source of truth.
  .post(
    "/wiki/:slug/attach",
    async ({ request, params, body }) => {
      const user = await resolveOneDriveUser(request);
      requireFileBrowserAccess(user);
      await rateLimit("od.wikiAttach", user.clerkUserId, 20, "1 h");

      const base = `${wikiFolderBase()}/${params.slug}`;
      const subfolder = sanitizeRelativeSubfolder(body.folder);
      const targetRel = subfolder ? `${base}/${subfolder}` : base;
      assertCanWrite(user, targetRel);

      const file = body.file;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const [report, folder] = await Promise.all([
        scanFile({ bytes, fileName: file.name, declaredMime: file.type }),
        ensureFolderPath(targetRel),
      ]);
      if (report.verdict === "blocked") {
        const reason = report.flags.find((f) => f.severity === "danger");
        throw Errors.badRequest(reason?.detail ?? "This file type is not allowed");
      }
      const created = await uploadFile(folder.id, file.name, bytes, file.type);
      await invalidateAll();
      return {
        oneDriveItemId: created.id,
        oneDrivePath: `${targetRel}/${file.name}`,
        name: file.name,
        size: bytes.byteLength,
        contentType: file.type || "application/octet-stream",
        kind: (file.type || "").startsWith("image/") ? ("image" as const) : ("file" as const),
      };
    },
    {
      params: t.Object({ slug: t.String() }),
      body: t.Object({ file: t.File(), folder: t.Optional(t.String()) }),
    },
  )

  // Upload a document to an employee's HR folder — same shape/rules as the
  // wiki attach route above (see access.ts's Team/HR indirect grant).
  .post(
    "/hr/:employeeProfileId/attach",
    async ({ request, params, body }) => {
      const user = await resolveOneDriveUser(request);
      requireFileBrowserAccess(user);
      await rateLimit("od.hrAttach", user.clerkUserId, 20, "1 h");

      const { folderName } = await getConvex().query(api.humanResources.apiEmployeeFolderName, {
        serverKey: serverKey(),
        employeeProfileId: params.employeeProfileId as Id<"employeeProfiles">,
      });
      const base = `${hrFolderBase()}/${folderName}`;
      const subfolder = sanitizeRelativeSubfolder(body.folder);
      const targetRel = subfolder ? `${base}/${subfolder}` : base;
      assertCanWrite(user, targetRel);

      const file = body.file;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const [report, folder] = await Promise.all([
        scanFile({ bytes, fileName: file.name, declaredMime: file.type }),
        ensureFolderPath(targetRel),
      ]);
      if (report.verdict === "blocked") {
        const reason = report.flags.find((f) => f.severity === "danger");
        throw Errors.badRequest(reason?.detail ?? "This file type is not allowed");
      }
      const created = await uploadFile(folder.id, file.name, bytes, file.type);
      await invalidateAll();
      return {
        oneDriveItemId: created.id,
        oneDrivePath: `${targetRel}/${file.name}`,
        name: file.name,
        size: bytes.byteLength,
        contentType: file.type || "application/octet-stream",
        kind: (file.type || "").startsWith("image/") ? ("image" as const) : ("file" as const),
      };
    },
    {
      params: t.Object({ employeeProfileId: t.String() }),
      body: t.Object({ file: t.File(), folder: t.Optional(t.String()) }),
    },
  )

  // Rename and/or move an item (manager+).
  .patch(
    "/items/:id",
    async ({ request, params, body }) => {
      const user = await resolveOneDriveUser(request);
      requireFileBrowserAccess(user);
      const { rel } = await readableItem(user, params.id);
      assertCanWrite(user, rel);
      const patch: { name?: string; parentId?: string } = {};
      if (body.name) patch.name = body.name.trim();
      if (body.destPath !== undefined) {
        const destRel = normalizePath(body.destPath);
        assertCanWrite(user, destRel);
        const dest = await getItemByPath(destRel);
        patch.parentId = dest.id;
      }
      if (!patch.name && !patch.parentId) {
        throw Errors.badRequest("Nothing to change");
      }
      const updated = await renameOrMove(params.id, patch);
      await recordAction(user, patch.parentId ? "move" : "rename", rel);
      await invalidateAll();
      return { id: updated.id, name: updated.name };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        destPath: t.Optional(t.String()),
      }),
    },
  )

  // Delete an item to the recycle bin (manager+).
  .delete(
    "/items/:id",
    async ({ request, params }) => {
      const user = await resolveOneDriveUser(request);
      requireFileBrowserAccess(user);
      const { rel } = await readableItem(user, params.id);
      assertCanWrite(user, rel);
      await deleteById(params.id);
      await recordAction(user, "delete", rel);
      await invalidateAll();
      return { ok: true as const };
    },
    { params: t.Object({ id: t.String() }) },
  )

  // Version history (read).
  .get(
    "/items/:id/versions",
    async ({ request, params }) => {
      const user = await resolveOneDriveUser(request);
      requireFileBrowserAccess(user);
      await readableItem(user, params.id);
      const versions = await listVersions(params.id);
      return {
        versions: versions.map((v) => ({
          id: v.id,
          size: v.size ?? 0,
          lastModified: v.lastModifiedDateTime,
          modifiedBy: v.lastModifiedBy?.user?.displayName,
        })),
      };
    },
    { params: t.Object({ id: t.String() }) },
  )

  // Restore a previous version (manager+).
  .post(
    "/items/:id/versions/:versionId/restore",
    async ({ request, params }) => {
      const user = await resolveOneDriveUser(request);
      requireFileBrowserAccess(user);
      const { rel } = await readableItem(user, params.id);
      assertCanWrite(user, rel);
      await restoreVersion(params.id, params.versionId);
      await recordAction(user, "restore", rel);
      await invalidateAll();
      return { ok: true as const };
    },
    { params: t.Object({ id: t.String(), versionId: t.String() }) },
  )

  // Create an expiring anonymous share link (manager+).
  .post(
    "/items/:id/share",
    async ({ request, params, body }) => {
      const user = await resolveOneDriveUser(request);
      requireFileBrowserAccess(user);
      const { rel } = await readableItem(user, params.id);
      assertCanWrite(user, rel);
      const days = body?.expiresInDays ?? 7;
      const expiry = new Date(Date.now() + days * 86_400_000).toISOString();
      const url = await createShareLink(params.id, expiry);
      await recordAction(user, "share", rel);
      return { url, expiresAt: expiry };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Optional(t.Object({ expiresInDays: t.Optional(t.Number()) })),
    },
  )

  // List active employees + their direct Team-folder share status (manager+).
  .get("/team-access", async ({ request }) => {
    const user = await resolveOneDriveUser(request);
    requireManagerUser(user);
    const roster = await getConvex().query(api.onedrive.apiTeamAccessRoster, {
      serverKey: serverKey(),
    });
    return { users: roster };
  })

  // Grant one employee direct read-only access to the Team folder (manager+).
  // Additive only: if they already have any permission on the folder (a
  // higher role, an inherited share, …), leave it alone and report it
  // rather than inviting again — this must never downgrade or duplicate
  // existing access.
  .post(
    "/team-access/grant",
    async ({ request, body }) => {
      const user = await resolveOneDriveUser(request);
      requireManagerUser(user);
      const team = await getItemByPath(folderConfig().team);

      const existing = await findPermissionByEmail(team.id, body.email);
      if (existing) {
        await getConvex().mutation(api.onedrive.apiSetTeamAccess, {
          serverKey: serverKey(),
          actorUserId: user.userId,
          targetUserId: body.userId as Id<"users">,
          permissionId: existing.id,
        });
        return {
          ok: true as const,
          alreadyHadAccess: true as const,
          roles: existing.roles ?? [],
        };
      }

      const { permissionId } = await inviteToItem(team.id, body.email, "read");
      await getConvex().mutation(api.onedrive.apiSetTeamAccess, {
        serverKey: serverKey(),
        actorUserId: user.userId,
        targetUserId: body.userId as Id<"users">,
        permissionId,
      });
      return { ok: true as const, alreadyHadAccess: false as const };
    },
    { body: t.Object({ userId: t.String(), email: t.String() }) },
  )

  // Revoke a direct Team-folder share (manager+).
  .post(
    "/team-access/revoke",
    async ({ request, body }) => {
      const user = await resolveOneDriveUser(request);
      requireManagerUser(user);
      const team = await getItemByPath(folderConfig().team);
      await removePermission(team.id, body.permissionId);
      await getConvex().mutation(api.onedrive.apiClearTeamAccess, {
        serverKey: serverKey(),
        actorUserId: user.userId,
        targetUserId: body.userId as Id<"users">,
      });
      return { ok: true as const };
    },
    { body: t.Object({ userId: t.String(), permissionId: t.String() }) },
  )

  // Grant Team-folder access to every active employee missing it (manager+).
  .post("/team-access/sync", async ({ request }) => {
    const user = await resolveOneDriveUser(request);
    requireManagerUser(user);
    const roster = await getConvex().query(api.onedrive.apiTeamAccessRoster, {
      serverKey: serverKey(),
    });
    const missing = roster.filter((r) => !r.permissionId);
    const team = await getItemByPath(folderConfig().team);
    let granted = 0;
    let alreadyHadAccess = 0;
    for (const person of missing) {
      try {
        const existing = await findPermissionByEmail(team.id, person.email);
        const permissionId = existing
          ? existing.id
          : (await inviteToItem(team.id, person.email, "read")).permissionId;
        await getConvex().mutation(api.onedrive.apiSetTeamAccess, {
          serverKey: serverKey(),
          actorUserId: user.userId,
          targetUserId: person.userId,
          permissionId,
        });
        if (existing) alreadyHadAccess++;
        else granted++;
      } catch (error) {
        console.error(`[onedrive] team-access sync failed for ${person.email}:`, error);
      }
    }
    return {
      granted,
      alreadyHadAccess,
      skipped: roster.length - missing.length,
    };
  });

type OneDriveAuditAction = "mkdir" | "move" | "rename" | "delete" | "restore" | "share";

async function recordAction(
  user: OneDriveUser,
  action: OneDriveAuditAction,
  target: string,
): Promise<void> {
  try {
    await getConvex().mutation(api.onedrive.apiRecordAction, {
      serverKey: serverKey(),
      actorUserId: user.userId,
      action,
      target,
    });
  } catch (error) {
    console.error(`[onedrive] audit (${action}) failed:`, error);
  }
}
