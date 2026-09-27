/**
 * Moves the 14 built-in guides into the wiki, so the people who own the
 * content can keep it current instead of waiting for a code change.
 *
 * Run once from the dashboard after deploying:
 * `internal.migrations.moveGuidesToWiki.run({ ownerEmail: "…" })`. The owner
 * becomes each page's author and gets the wiki's usual review reminder when a
 * page's validity runs out (a year from the run). Until this has run, the
 * intranet keeps showing the guides from code, so deploying first is safe.
 *
 * Each guide keeps its slug, so links, read confirmations and feedback stay
 * attached. Manager-only guides keep that restriction (`minRole`), guides a
 * manager had highlighted come across pinned (within the wiki's 5-pin limit),
 * and each lands in the category matching its old topic, created if missing.
 * Idempotent: a slug that already has a wiki entry is skipped.
 */
import { ConvexError, v } from "convex/values";

import { internalMutation } from "../functions";
import { BUILTIN_GUIDES, type BuiltinGuide } from "../wiki/builtinGuides";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_PINS = 5;

/** Same names and colours the guides list already shows for these topics
 *  (LEGACY_TOPIC_META in the intranet's lib/wiki.ts), so nothing gets
 *  renamed under people's feet. "Onboarding" is also a default category. */
const TOPIC_CATEGORY: Record<BuiltinGuide["topic"], { name: string; color: string }> = {
  onboarding: { name: "Onboarding", color: "#4A5AB8" },
  collaboration: { name: "Zusammenarbeit", color: "#2F7FA6" },
  "time-account": { name: "Zeit & Konto", color: "#C77E1A" },
  "it-workplace": { name: "IT & Arbeitsplatz", color: "#4E8A3C" },
  management: { name: "Management", color: "#B2496E" },
};

export const run = internalMutation({
  args: { ownerEmail: v.string() },
  handler: async (ctx, { ownerEmail }) => {
    const owner = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", ownerEmail.trim().toLowerCase()))
      .first();
    if (!owner || owner.status !== "active") {
      throw new ConvexError({ code: "bad_request", message: "Owner must be an active user" });
    }
    const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email;

    const categories = await ctx.db.query("wikiCategories").collect();
    const categoryIds = new Map(categories.map((c) => [c.name, c._id]));
    const highlighted = new Set(
      (await ctx.db.query("guidebookHighlights").collect()).map((h) => h.slug),
    );
    let pinned = (await ctx.db.query("wikiEntries").collect()).filter((e) => e.pinned).length;

    const now = Date.now();
    const created: string[] = [];
    const skipped: string[] = [];
    for (const guide of BUILTIN_GUIDES) {
      const existing = await ctx.db
        .query("wikiEntries")
        .withIndex("by_slug", (q) => q.eq("slug", guide.slug))
        .unique();
      if (existing) {
        skipped.push(guide.slug);
        continue;
      }

      const category = TOPIC_CATEGORY[guide.topic];
      let categoryId = categoryIds.get(category.name);
      if (!categoryId) {
        categoryId = await ctx.db.insert("wikiCategories", {
          name: category.name,
          color: category.color,
          createdByUserId: owner._id,
          createdAt: now,
        });
        categoryIds.set(category.name, categoryId);
      }

      const pin = highlighted.has(guide.slug) && pinned < MAX_PINS;
      if (pin) pinned++;

      await ctx.db.insert("wikiEntries", {
        slug: guide.slug,
        categoryId,
        thema: guide.title,
        erklaerung: guide.html,
        tags: [],
        minRole: guide.minRole,
        validFrom: now,
        validUntil: now + YEAR_MS,
        version: 1,
        pinned: pin,
        authorUserId: owner._id,
        authorName: ownerName,
        ownerUserId: owner._id,
        createdAt: now,
        updatedAt: now,
      });
      created.push(guide.slug);
    }
    return { created, skipped };
  },
});
