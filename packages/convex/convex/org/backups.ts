import { v } from "convex/values";

import { serverMutation, userMutation, userQuery } from "../functions";
import { alertAdmins } from "../lib/notify";
import { displayName } from "../lib/users";

/** Called by apps/api when the backup GitHub Action finishes, either way. */
export const apiRecord = serverMutation({
  args: {
    status: v.union(v.literal("ok"), v.literal("failed")),
    fileName: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("backupRuns", { kind: "backup", ...args, at: Date.now() });
    if (args.status === "failed") {
      await alertAdmins(ctx, {
        title: "Last night's backup failed",
        body: args.note?.slice(0, 200),
      });
    }
  },
});

/** An admin confirms they restored the latest backup into a preview
 *  deployment and it worked (docs/backups.md). */
export const recordRestoreTest = userMutation({
  role: "admin",
  args: { status: v.union(v.literal("ok"), v.literal("failed")), note: v.optional(v.string()) },
  handler: async (ctx, { status, note }) => {
    await ctx.db.insert("backupRuns", {
      kind: "restore_test",
      status,
      note: note?.trim().slice(0, 500) || undefined,
      recordedByUserId: ctx.caller.id,
      at: Date.now(),
    });
  },
});

/** What the admin backup card shows: the latest backups and restore tests. */
export const overview = userQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const latest = (kind: "backup" | "restore_test", n: number) =>
      ctx.db
        .query("backupRuns")
        .withIndex("by_kind_at", (q) => q.eq("kind", kind))
        .order("desc")
        .take(n);
    const [backups, restoreTests] = await Promise.all([
      latest("backup", 14),
      latest("restore_test", 3),
    ]);
    return {
      backups: backups.map(({ _id, status, fileName, sizeBytes, at }) => ({
        _id,
        status,
        fileName: fileName ?? null,
        sizeBytes: sizeBytes ?? null,
        at,
      })),
      restoreTests: await Promise.all(
        restoreTests.map(async ({ _id, status, note, recordedByUserId, at }) => ({
          _id,
          status,
          note: note ?? null,
          by: recordedByUserId ? displayName(await ctx.db.get(recordedByUserId)) : null,
          at,
        })),
      ),
    };
  },
});
