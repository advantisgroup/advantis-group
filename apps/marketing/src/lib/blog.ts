import { api } from "@advantis/convex/api";
import { ConvexHttpClient } from "convex/browser";

// Plain per-request ConvexHttpClient, matching the pattern already used in
// app/api/[[...slugs]]/notify and email — not convex/nextjs's fetchQuery,
// which this repo only uses once, in apps/intranet's edge middleware, for a
// different kind of call. Every request gets live data straight from
// Convex; there's no fetch cache layer here to invalidate.
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/** Shape returned by the list query — no `body`, which the grid never renders. */
export interface BlogPostSummary {
  _id: string;
  title: string;
  slug: string;
  language: "de" | "en";
  excerpt: string;
  category: string | null;
  mainImageUrl: string | null;
  author: string;
  authorAvatarUrl: string | null;
  readingMinutes: number | null;
  publishedAt: number;
}

export interface BlogPost extends BlogPostSummary {
  body: string;
}

export function getPosts(language: "de" | "en"): Promise<BlogPostSummary[]> {
  return convex.query(api.blogPosts.getAll, { language });
}

export function getPost(language: "de" | "en", slug: string): Promise<BlogPost | null> {
  return convex.query(api.blogPosts.getBySlug, { language, slug });
}
