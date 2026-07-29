import { type Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireManager, requireUser } from "./lib/auth";
import { PALETTE } from "./wikiCategories";

/** Presence of a row means the one-time `guidebookPages` → `wikiEntries`
 * migration has run. The wiki list page shows a full-screen "migrate now"
 * gate until this resolves to non-null. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const row = await ctx.db.query("wikiMigrationStatus").first();
    return row ? { migratedAt: row.migratedAt, migratedCount: row.migratedCount } : null;
  },
});

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Flattens the block-editor JSON blob into plain text for `erklaerung` —
 * the new entry form is a single textarea, not a rich block editor. */
function extractPlainText(blocksJson: string): string {
  try {
    const blocks = JSON.parse(blocksJson) as Array<{
      type: string;
      html?: string;
      code?: string;
      caption?: string;
    }>;
    if (!Array.isArray(blocks)) return "";
    return blocks
      .map((b) => {
        if (b.type === "code") return b.code ?? "";
        if (b.type === "image") return b.caption ?? "";
        return b.html ? stripHtml(b.html) : "";
      })
      .filter(Boolean)
      .join("\n\n");
  } catch {
    return "";
  }
}

const TOPIC_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  collaboration: "Zusammenarbeit",
  "time-account": "Zeit & Konto",
  "it-workplace": "IT & Arbeitsplatz",
  management: "Management",
};

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** One-time, manager-triggered: migrates every `guidebookPages` row (the old
 * block-editor "custom" pages) into a `wikiEntries` row, auto-creating one
 * category per distinct legacy `topic`. Previously-highlighted pages come
 * across pinned (capped at the new 5-pin limit). The hardcoded registry
 * guidebooks (interactive tools/components, not content) are left alone —
 * there's nothing there to migrate. Idempotent per slug, but rejects a
 * second full run once `wikiMigrationStatus` exists. */
export const run = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireManager(ctx);
    const already = await ctx.db.query("wikiMigrationStatus").first();
    if (already) return { migratedCount: already.migratedCount, alreadyDone: true as const };

    const pages = await ctx.db.query("guidebookPages").collect();
    const highlights = await ctx.db.query("guidebookHighlights").collect();
    const highlightedSlugs = new Set(highlights.map((h) => h.slug));
    const existingCategories = await ctx.db.query("wikiCategories").collect();
    const categoryByTopic = new Map<string, Id<"wikiCategories">>();
    for (const c of existingCategories) {
      const topic = Object.entries(TOPIC_LABELS).find(([, label]) => label === c.name)?.[0];
      if (topic) categoryByTopic.set(topic, c._id);
    }

    const now = Date.now();
    let pinnedSoFar = highlightedSlugs.size > 0 ? 0 : 5; // pre-fill to skip work if nothing to pin
    let migrated = 0;

    for (const page of pages) {
      const existing = await ctx.db
        .query("wikiEntries")
        .withIndex("by_slug", (q) => q.eq("slug", page.slug))
        .unique();
      if (existing) continue;

      let categoryId = categoryByTopic.get(page.topic);
      if (!categoryId) {
        const name = TOPIC_LABELS[page.topic] ?? page.topic;
        const color = PALETTE[categoryByTopic.size % PALETTE.length];
        categoryId = await ctx.db.insert("wikiCategories", {
          name,
          color,
          createdByUserId: user._id,
          createdAt: now,
        });
        categoryByTopic.set(page.topic, categoryId);
      }

      const pinned = highlightedSlugs.has(page.slug) && pinnedSoFar < 5;
      if (pinned) pinnedSoFar++;

      const author = await ctx.db.get(page.authorUserId);
      const authorName = author
        ? [author.firstName, author.lastName].filter(Boolean).join(" ") || author.email
        : "";

      await ctx.db.insert("wikiEntries", {
        slug: page.slug,
        categoryId,
        thema: page.title,
        erklaerung: extractPlainText(page.blocks) || page.description,
        tags: [],
        validFrom: page.createdAt,
        validUntil: page.createdAt + YEAR_MS,
        version: 1,
        pinned,
        authorUserId: page.authorUserId,
        authorName,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt ?? page.createdAt,
      });
      migrated++;
    }

    await ctx.db.insert("wikiMigrationStatus", {
      migratedAt: now,
      migratedByUserId: user._id,
      migratedCount: migrated,
    });
    return { migratedCount: migrated, alreadyDone: false as const };
  },
});
