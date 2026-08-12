import { sandboxedMutation as mutation } from "./lib/sandbox";
import { query } from "./_generated/server";
import { requireManager, requireUser } from "./lib/auth";

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

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Flattens the block-editor JSON blob into HTML paragraphs for
 * `erklaerung` — the new entry form uses a rich-text editor (HTML string),
 * not a plain textarea, so plain-text output must be escaped and
 * paragraph-wrapped rather than handed over as-is. */
function extractPlainText(blocksJson: string): string {
  try {
    const blocks = JSON.parse(blocksJson) as Array<{
      type: string;
      html?: string;
      code?: string;
      caption?: string;
    }>;
    if (!Array.isArray(blocks)) return "";
    const paragraphs = blocks
      .map((b) => {
        if (b.type === "code") return b.code ?? "";
        if (b.type === "image") return b.caption ?? "";
        return b.html ? stripHtml(b.html) : "";
      })
      .filter(Boolean);
    return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  } catch {
    return "";
  }
}

// Only "onboarding" has an obvious match among the prototype's real default
// categories (see wikiCategories.ts). Migration never invents a new
// category for a legacy topic — anything else is left uncategorized so a
// manager assigns it deliberately, rather than the migration silently
// growing its own parallel taxonomy alongside the real defaults.
const TOPIC_TO_DEFAULT_CATEGORY: Record<string, string> = {
  onboarding: "Onboarding",
};

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** One-time, manager-triggered: migrates every `guidebookPages` row (the old
 * block-editor "custom" pages) into a `wikiEntries` row. Previously-
 * highlighted pages come across pinned (capped at the new 5-pin limit). The
 * hardcoded registry guidebooks (interactive tools/components, not content)
 * are left alone — there's nothing there to migrate. Idempotent per slug,
 * but rejects a second full run once `wikiMigrationStatus` exists. */
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
    const categoryByName = new Map(existingCategories.map((c) => [c.name, c._id]));

    const now = Date.now();
    let pinnedSoFar = highlightedSlugs.size > 0 ? 0 : 5; // pre-fill to skip work if nothing to pin
    let migrated = 0;

    for (const page of pages) {
      const existing = await ctx.db
        .query("wikiEntries")
        .withIndex("by_slug", (q) => q.eq("slug", page.slug))
        .unique();
      if (existing) continue;

      const defaultCategoryName = TOPIC_TO_DEFAULT_CATEGORY[page.topic];
      const categoryId = defaultCategoryName ? categoryByName.get(defaultCategoryName) : undefined;

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
        erklaerung: extractPlainText(page.blocks) || `<p>${escapeHtml(page.description)}</p>`,
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
