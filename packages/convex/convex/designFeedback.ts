import { userQuery, userMutation } from "./functions";
import { v } from "convex/values";
import { displayName } from "./lib/users";

const sentimentValidator = v.union(
  v.literal("positive"),
  v.literal("neutral"),
  v.literal("negative"),
);

export const submit = userMutation({
  args: { sentiment: sentimentValidator, message: v.string(), path: v.string() },
  handler: async (ctx, { sentiment, message, path }) => {
    const user = ctx.caller.user;
    await ctx.db.insert("designFeedback", {
      userId: user._id,
      sentiment,
      message: message.trim().slice(0, 4000),
      path: path.slice(0, 300),
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

export const list = userQuery({
  role: "manager",
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("designFeedback")
      .withIndex("by_createdAt")
      .order("desc")
      .take(300);
    return Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        userId: row.userId,
        userName: displayName(await ctx.db.get(row.userId)),
        sentiment: row.sentiment,
        message: row.message,
        path: row.path,
        createdAt: row.createdAt,
      })),
    );
  },
});
