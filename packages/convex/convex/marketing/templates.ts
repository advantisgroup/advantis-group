import { ConvexError, v } from "convex/values";

import { userMutation, userQuery } from "../functions";
import { moveToTrash } from "../lib/trash";

/**
 * Canned replies for the inquiry inbox (`/inquiries/templates`). Everyone who
 * works the inbox shares one set and can edit it. See docs/inquiries.md.
 */

const inbox = { can: "manage_inquiries" } as const;

const MAX_TEMPLATES = 200;
const MAX_TITLE = 120;
const MAX_BODY = 10000;

export const list = userQuery({
  ...inbox,
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("inquiryReplyTemplates").take(MAX_TEMPLATES);
    return rows.sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0) || a.title.localeCompare(b.title));
  },
});

export const save = userMutation({
  ...inbox,
  args: {
    id: v.optional(v.id("inquiryReplyTemplates")),
    title: v.string(),
    body: v.string(),
    locale: v.optional(v.string()),
  },
  handler: async (ctx, { id, title, body, locale }) => {
    const name = title.trim().slice(0, MAX_TITLE);
    const text = body.trim().slice(0, MAX_BODY);
    if (!name || !text)
      throw new ConvexError({ code: "invalid", message: "Title and text needed" });
    const fields = { title: name, body: text, locale: locale || undefined, updatedAt: Date.now() };
    if (id) {
      if (!(await ctx.db.get(id))) {
        throw new ConvexError({ code: "not_found", message: "Template not found" });
      }
      await ctx.db.patch(id, { ...fields, updatedByUserId: ctx.caller.user._id });
      return id;
    }
    return await ctx.db.insert("inquiryReplyTemplates", {
      ...fields,
      createdByUserId: ctx.caller.user._id,
    });
  },
});

export const remove = userMutation({
  ...inbox,
  args: { id: v.id("inquiryReplyTemplates") },
  handler: async (ctx, { id }) => {
    await moveToTrash(ctx, "inquiryReplyTemplates", id, ctx.caller.user._id);
  },
});

/** Counted when a template goes into a reply, so the ones people use float up. */
export const markUsed = userMutation({
  ...inbox,
  args: { id: v.id("inquiryReplyTemplates") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row) await ctx.db.patch(id, { uses: (row.uses ?? 0) + 1 });
  },
});
