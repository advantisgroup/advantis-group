import { ConvexError, v } from "convex/values";

import { type Doc } from "../_generated/dataModel";
import { type QueryCtx } from "../_generated/server";
import { userMutation, userQuery } from "../functions";
import { slugify } from "../lib/text";
import { displayName } from "../lib/users";
import { markAnswered } from "./gaps";
import { DEFAULT_BRIEFING, DEFAULT_BRIEFING_TITLE, log, requireTrainer } from "./lib";

const YEAR_MS = 365 * 86_400_000;

async function toView(ctx: QueryCtx, p: Doc<"aiTrainingProposals">) {
  const entry = p.entryId ? await ctx.db.get(p.entryId) : null;
  const rule =
    p.kind !== "rule_update"
      ? null
      : p.ruleId
        ? await ctx.db.get(p.ruleId)
        : (await ctx.db.query("aiTrainingRules").collect()).find((r) => r.builtin);
  const session = p.sessionId ? await ctx.db.get(p.sessionId) : null;
  return {
    _id: p._id,
    kind: p.kind,
    title: p.title,
    body: p.body,
    tags: p.tags,
    categoryName: p.categoryName ?? null,
    reason: p.reason,
    status: p.status,
    createdAt: p.createdAt,
    createdByName: displayName(await ctx.db.get(p.createdBy)),
    decidedByName: p.decidedBy ? displayName(await ctx.db.get(p.decidedBy)) : null,
    decidedAt: p.decidedAt ?? null,
    session: session ? { _id: session._id, title: session.title } : null,
    entry: entry
      ? {
          _id: entry._id,
          slug: entry.slug,
          thema: entry.thema,
          erklaerung: entry.erklaerung,
          tags: entry.tags,
          categoryId: entry.categoryId ?? null,
          version: entry.version,
          changedSince: p.baseVersion !== undefined && entry.version !== p.baseVersion,
        }
      : null,
    currentRule:
      p.kind === "rule_update"
        ? rule
          ? { title: rule.title, text: rule.text }
          : { title: DEFAULT_BRIEFING_TITLE, text: DEFAULT_BRIEFING }
        : null,
  };
}

export type ProposalView = Awaited<ReturnType<typeof toView>>;

export const list = userQuery({
  args: { status: v.union(v.literal("open"), v.literal("applied"), v.literal("rejected")) },
  handler: async (ctx, { status }) => {
    requireTrainer(ctx.caller);
    const rows = await ctx.db
      .query("aiTrainingProposals")
      .withIndex("by_status", (q) => q.eq("status", status))
      .order("desc")
      .take(100);
    return Promise.all(rows.map((p) => toView(ctx, p)));
  },
});

export const bySession = userQuery({
  args: { sessionId: v.id("aiTrainingSessions") },
  handler: async (ctx, { sessionId }) => {
    requireTrainer(ctx.caller);
    const rows = await ctx.db
      .query("aiTrainingProposals")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .take(200);
    return Promise.all(rows.map((p) => toView(ctx, p)));
  },
});

export const apply = userMutation({
  args: {
    proposalId: v.id("aiTrainingProposals"),
    title: v.string(),
    body: v.string(),
    tags: v.array(v.string()),
    categoryId: v.optional(v.id("wikiCategories")),
    /** Slugs the intranet's static guides use, which Convex doesn't know. */
    reservedSlugs: v.array(v.string()),
  },
  handler: async (ctx, { proposalId, title, body, tags, categoryId, reservedSlugs }) => {
    requireTrainer(ctx.caller);
    const p = await ctx.db.get(proposalId);
    if (!p) throw new ConvexError({ code: "not_found", message: "Not found" });
    if (p.status !== "open")
      throw new ConvexError({ code: "conflict", message: "Already decided" });
    const name = title.trim().slice(0, 200);
    if (!name || !body.trim()) {
      throw new ConvexError({ code: "bad_request", message: "Title and text are required" });
    }
    const cleanTags = tags
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8);
    const user = ctx.caller.user;
    const now = Date.now();
    let href: string;

    if (p.kind === "wiki_new") {
      const base = slugify(name, "eintrag");
      const reserved = new Set(reservedSlugs);
      let slug = base;
      for (let i = 2; ; i++) {
        const taken =
          reserved.has(slug) ||
          (await ctx.unfilteredDb
            .query("wikiEntries")
            .withIndex("by_slug", (q) => q.eq("slug", slug))
            .first());
        if (!taken) break;
        slug = `${base}-${i}`;
      }
      await ctx.db.insert("wikiEntries", {
        slug,
        categoryId,
        thema: name,
        erklaerung: body,
        tags: cleanTags,
        validFrom: now,
        validUntil: now + YEAR_MS,
        version: 1,
        pinned: false,
        authorUserId: user._id,
        authorName: displayName(user),
        ownerUserId: user._id,
        createdAt: now,
        updatedAt: now,
      });
      href = `/guidebooks/${slug}`;
    } else if (p.kind === "wiki_update") {
      const entry = p.entryId ? await ctx.db.get(p.entryId) : null;
      if (!entry) throw new ConvexError({ code: "not_found", message: "Wiki entry is gone" });
      await ctx.db.patch(entry._id, {
        thema: name,
        erklaerung: body,
        tags: cleanTags,
        ...(categoryId ? { categoryId, categoryName: undefined } : {}),
        version: entry.version + 1,
        updatedAt: now,
      });
      href = `/guidebooks/${entry.slug}`;
    } else {
      const existing =
        p.kind === "rule_update"
          ? p.ruleId
            ? await ctx.db.get(p.ruleId)
            : (await ctx.db.query("aiTrainingRules").collect()).find((r) => r.builtin)
          : null;
      if (existing) {
        await ctx.db.patch(existing._id, {
          title: name,
          text: body,
          updatedBy: user._id,
          updatedAt: now,
        });
      } else if (p.kind === "rule_update" && p.ruleId) {
        throw new ConvexError({ code: "not_found", message: "Rule is gone" });
      } else {
        await ctx.db.insert("aiTrainingRules", {
          title: name,
          text: body,
          active: true,
          builtin: p.kind === "rule_update" ? true : undefined,
          createdBy: user._id,
          updatedBy: user._id,
          createdAt: now,
          updatedAt: now,
        });
      }
      href = "/ki-pflege/regeln";
    }

    await ctx.db.patch(proposalId, { status: "applied", decidedBy: user._id, decidedAt: now });
    await log(ctx, user._id, "proposal_applied", name, { detail: p.kind, href });
    if (p.gapId) await markAnswered(ctx, p.gapId, user._id);
    return { href };
  },
});

export const reject = userMutation({
  args: { proposalId: v.id("aiTrainingProposals") },
  handler: async (ctx, { proposalId }) => {
    requireTrainer(ctx.caller);
    const p = await ctx.db.get(proposalId);
    if (!p || p.status !== "open") return null;
    await ctx.db.patch(proposalId, {
      status: "rejected",
      decidedBy: ctx.caller.id,
      decidedAt: Date.now(),
    });
    await log(ctx, ctx.caller.id, "proposal_rejected", p.title);
    return null;
  },
});
