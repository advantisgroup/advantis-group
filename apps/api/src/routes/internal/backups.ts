import { api } from "@advantis/convex/api";
import { Elysia, t } from "elysia";

import { getConvex, getConvexServerKey } from "../../lib/convex.js";
import { requireServerKey } from "../../lib/middleware.js";
import { deleteById, listChildrenById, createUploadSession } from "../../lib/onedrive/graph.js";
import { ensureFolderPath } from "../../lib/onedrive/provisionFolder.js";

/** Outside the Team zone, so only the managing-director allowlist can see it
 *  in the file browser. The files are encrypted before they get here anyway. */
const BACKUP_FOLDER = "Backups/Convex";

/**
 * Server-key gated routes for the convex-backup GitHub Action. The Action
 * never holds OneDrive credentials: it asks for an upload session here and
 * sends the bytes straight to Graph's pre-authorised URL.
 */
export const internalBackupsRoute = new Elysia({ prefix: "/internal/backups" })
  .post(
    "/upload-session",
    async ({ request, body }) => {
      requireServerKey(request);
      const folder = await ensureFolderPath(BACKUP_FOLDER);
      return { uploadUrl: await createUploadSession(folder.id, body.fileName) };
    },
    { body: t.Object({ fileName: t.String({ pattern: "^[\\w.-]+$", maxLength: 120 }) }) },
  )
  .post(
    "/prune",
    async ({ request, body }) => {
      requireServerKey(request);
      const folder = await ensureFolderPath(BACKUP_FOLDER);
      const cutoff = Date.now() - body.keepDays * 86_400_000;
      const old = (await listChildrenById(folder.id)).filter(
        (item) =>
          item.file && item.lastModifiedDateTime && Date.parse(item.lastModifiedDateTime) < cutoff,
      );
      for (const item of old) await deleteById(item.id);
      return { deleted: old.length };
    },
    { body: t.Object({ keepDays: t.Number({ minimum: 7 }) }) },
  )
  .post(
    "/record",
    async ({ request, body }) => {
      requireServerKey(request);
      await getConvex().mutation(api.org.backups.apiRecord, {
        serverKey: getConvexServerKey(),
        ...body,
      });
      return { ok: true };
    },
    {
      body: t.Object({
        status: t.Union([t.Literal("ok"), t.Literal("failed")]),
        fileName: t.Optional(t.String()),
        sizeBytes: t.Optional(t.Number()),
        note: t.Optional(t.String({ maxLength: 500 })),
      }),
    },
  );
