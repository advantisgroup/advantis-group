/**
 * "Interne Notizen" on an employee's Performance page (11/2026): free-text
 * notes about a person, for admins only. The employee never sees them, and
 * neither does a non-admin team lead.
 *
 * Reads go through `loadViewer` without `ownRights`, so during an admin's
 * "Ansicht als" preview the notes are hidden exactly as the previewed person
 * would experience it. Writes always use the admin's own rights.
 */
import { ConvexError, v } from "convex/values";

import { type Id } from "../_generated/dataModel";
import { userMutation, userQuery } from "../functions";
import { loadViewer, requireAdmin } from "./lib/access";

const MAX_LENGTH = 5000;

const notFound = (message: string) => new ConvexError({ code: "not_found", message });

function cleanText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new ConvexError({ code: "validation", message: "Die Notiz ist leer." });
  }
  if (trimmed.length > MAX_LENGTH) {
    throw new ConvexError({
      code: "validation",
      message: `Die Notiz ist zu lang (max. ${MAX_LENGTH} Zeichen).`,
    });
  }
  return trimmed;
}

/** All notes on one employee, newest first. Admins only. */
export const list = userQuery({
  args: { employeeId: v.id("performanceEmployees") },
  handler: async (ctx, { employeeId }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    requireAdmin(viewer);
    const notes = await ctx.db
      .query("performanceNotes")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();
    return notes
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((n) => ({
        id: n._id,
        text: n.text,
        authorName: n.authorName,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt ?? null,
        mine: n.authorUserId === viewer.userId,
      }));
  },
});

export const add = userMutation({
  args: { employeeId: v.id("performanceEmployees"), text: v.string() },
  handler: async (ctx, { employeeId, text }): Promise<{ id: Id<"performanceNotes"> }> => {
    const viewer = await loadViewer(ctx, ctx.caller, { ownRights: true });
    requireAdmin(viewer);
    const employee = await ctx.db.get(employeeId);
    if (!employee) throw notFound("Mitarbeiter nicht gefunden.");
    const id = await ctx.db.insert("performanceNotes", {
      employeeId,
      text: cleanText(text),
      authorUserId: viewer.userId,
      authorName: viewer.name,
      createdAt: Date.now(),
    });
    return { id };
  },
});

/** Any admin may edit or delete a note (not just its author). */
export const update = userMutation({
  args: { id: v.id("performanceNotes"), text: v.string() },
  handler: async (ctx, { id, text }) => {
    const viewer = await loadViewer(ctx, ctx.caller, { ownRights: true });
    requireAdmin(viewer);
    const note = await ctx.db.get(id);
    if (!note) throw notFound("Notiz nicht gefunden.");
    await ctx.db.patch(id, { text: cleanText(text), updatedAt: Date.now() });
  },
});

export const remove = userMutation({
  args: { id: v.id("performanceNotes") },
  handler: async (ctx, { id }) => {
    const viewer = await loadViewer(ctx, ctx.caller, { ownRights: true });
    requireAdmin(viewer);
    const note = await ctx.db.get(id);
    if (!note) throw notFound("Notiz nicht gefunden.");
    await ctx.db.delete(id);
  },
});
