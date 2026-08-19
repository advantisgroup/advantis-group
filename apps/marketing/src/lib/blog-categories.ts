/**
 * The canonical blog category slugs. Kept as a plain list here (and mirrored
 * in the intranet composer's own copy) rather than a Convex schema union, so
 * adding a category is a code change in the two apps instead of a schema
 * push. Labels are translated per locale under the `blog.categories` key.
 *
 * Deliberately no per-category colour: an eyebrow row that changes hue post
 * to post reads as decoration, not information. One accent, differentiated
 * by the label itself, is what the editorial sites this is modelled on do.
 */
export const BLOG_CATEGORIES = ["unternehmen", "vertrieb", "ki", "karriere", "events"] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export function isBlogCategory(value: string | null | undefined): value is BlogCategory {
  return !!value && (BLOG_CATEGORIES as readonly string[]).includes(value);
}
