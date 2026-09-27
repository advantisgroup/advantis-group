import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { userMutation, userQuery } from "../functions";
import { profileAvatarUrl, profileDisplayName } from "../lib/profile";

const sectionValidator = v.union(v.literal("help"), v.literal("safety"));

const fields = {
  section: sectionValidator,
  topic: v.string(),
  note: v.optional(v.string()),
  userIds: v.array(v.id("users")),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
};

/** Everyone signed in reads the list; people who left drop out of it. */
export const list = userQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("contactTopics").collect();
    const people = new Map<Id<"users">, Doc<"users"> | null>();
    for (const row of rows) {
      for (const id of row.userIds) if (!people.has(id)) people.set(id, await ctx.db.get(id));
    }
    const collator = new Intl.Collator("de");
    return Promise.all(
      rows
        .sort((a, b) => collator.compare(a.topic, b.topic))
        .map(async (row) => ({
          _id: row._id,
          section: row.section,
          topic: row.topic,
          note: row.note ?? null,
          phone: row.phone ?? null,
          email: row.email ?? null,
          people: await Promise.all(
            row.userIds
              .map((id) => people.get(id))
              .filter((u): u is Doc<"users"> => !!u && u.status === "active")
              .map(async (u) => ({
                userId: u._id,
                name: profileDisplayName(u),
                email: u.email,
                phone: u.phone ?? null,
                jobTitle: u.jobTitle ?? null,
                avatarUrl: await profileAvatarUrl(ctx, u),
                statusMessage: u.statusText
                  ? { text: u.statusText, until: u.statusUntil ?? null }
                  : null,
              })),
          ),
        })),
    );
  },
});

function clean(args: {
  topic: string;
  note?: string;
  phone?: string;
  email?: string;
  userIds: Id<"users">[];
}) {
  const topic = args.topic.trim();
  if (!topic) throw new ConvexError({ code: "bad_request", message: "A topic is required" });
  const note = args.note?.trim() || undefined;
  const phone = args.phone?.trim() || undefined;
  const email = args.email?.trim() || undefined;
  const userIds = [...new Set(args.userIds)];
  if (userIds.length === 0 && !phone && !email) {
    throw new ConvexError({
      code: "bad_request",
      message: "Add at least one person, a phone number or an email",
    });
  }
  return { topic, note, phone, email, userIds };
}

export const create = userMutation({
  role: "admin",
  args: fields,
  handler: async (ctx, args) => {
    return ctx.db.insert("contactTopics", {
      section: args.section,
      ...clean(args),
      updatedAt: Date.now(),
      updatedBy: ctx.caller.user._id,
    });
  },
});

export const update = userMutation({
  role: "admin",
  args: { id: v.id("contactTopics"), ...fields },
  handler: async (ctx, { id, ...args }) => {
    if (!(await ctx.db.get(id))) throw new ConvexError({ code: "not_found", message: "Not found" });
    // Written out in full: an optional field left empty in the form means
    // "clear it", which a spread of the args would silently skip.
    const { topic, note, phone, email, userIds } = clean(args);
    await ctx.db.patch(id, {
      section: args.section,
      topic,
      note,
      phone,
      email,
      userIds,
      updatedAt: Date.now(),
      updatedBy: ctx.caller.user._id,
    });
  },
});

export const remove = userMutation({
  role: "admin",
  args: { id: v.id("contactTopics") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
