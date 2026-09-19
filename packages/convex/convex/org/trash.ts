import { ConvexError, v } from "convex/values";

import { type Id } from "../_generated/dataModel";
import { internalMutation, userMutation, userQuery } from "../functions";
import { type Caller } from "../lib/caller";
import {
  purge,
  restoreFromTrash,
  TRASH_DAYS,
  TRASH_TABLES,
  trashLabel,
  type TrashTable,
} from "../lib/trash";
import { displayName } from "../lib/users";

const DAY_MS = 86_400_000;
const trashTable = v.union(...TRASH_TABLES.map((t) => v.literal(t)));

/** Your own deletes, or everything for admins — but applicants only ever for
 *  people with applicant access, whoever deleted them. */
function canSee(caller: Caller, table: TrashTable, doc: { deletedBy?: Id<"users"> }) {
  if (table === "applicants" && !caller.hasApplicantAccess) return false;
  return caller.isAdmin || doc.deletedBy === caller.id;
}

/** Recently deleted, as far as canSee allows. */
export const list = userQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await Promise.all(
      TRASH_TABLES.map(async (table) => {
        const docs = await ctx.unfilteredDb
          .query(table)
          .withIndex("by_deletedAt", (q) => q.gt("deletedAt", 0))
          .order("desc")
          .take(100);
        return docs.filter((doc) => canSee(ctx.caller, table, doc)).map((doc) => ({ table, doc }));
      }),
    );
    const items = rows.flat().sort((a, b) => b.doc.deletedAt! - a.doc.deletedAt!);
    const deleters = new Map<Id<"users">, string>();
    for (const { doc } of items) {
      if (doc.deletedBy && !deleters.has(doc.deletedBy)) {
        deleters.set(doc.deletedBy, displayName(await ctx.db.get(doc.deletedBy)));
      }
    }
    return items.map(({ table, doc }) => ({
      table,
      id: doc._id as string,
      label: trashLabel(table, doc),
      deletedAt: doc.deletedAt!,
      deletedByName: doc.deletedBy ? (deleters.get(doc.deletedBy) ?? null) : null,
      purgesAt: doc.deletedAt! + TRASH_DAYS * DAY_MS,
    }));
  },
});

/** Bring something back — anyone who can see it in the trash. */
export const restore = userMutation({
  args: { table: trashTable, id: v.string() },
  handler: async (ctx, { table, id }) => {
    const docId = ctx.unfilteredDb.normalizeId(table, id);
    const doc = docId ? await ctx.unfilteredDb.get(docId) : null;
    if (!doc || doc.deletedAt === undefined) {
      throw new ConvexError({ code: "not_found", message: "Nothing to restore" });
    }
    ctx.caller.require(canSee(ctx.caller, table, doc));
    await restoreFromTrash({ db: ctx.unfilteredDb }, table, doc, ctx.caller.id);
    return { ok: true };
  },
});

/** Daily: remove for good whatever has sat in the trash past its window. */
export const purgeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - TRASH_DAYS * DAY_MS;
    let purged = 0;
    for (const table of TRASH_TABLES) {
      const expired = await ctx.unfilteredDb
        .query(table)
        .withIndex("by_deletedAt", (q) => q.gt("deletedAt", 0).lte("deletedAt", cutoff))
        .take(100);
      for (const doc of expired) {
        await purge({ ...ctx, db: ctx.unfilteredDb }, table, doc);
        purged++;
      }
    }
    return { purged };
  },
});
