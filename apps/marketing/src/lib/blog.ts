import { api } from "@advantis/convex/api";
import { ConvexHttpClient } from "convex/browser";

// Plain per-request ConvexHttpClient, matching the pattern already used in
// app/api/[[...slugs]]/notify and email — not convex/nextjs's fetchQuery,
// which this repo only uses once, in apps/intranet's edge middleware, for a
// different kind of call. Every request gets live data straight from
// Convex; there's no fetch cache layer here to invalidate.
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export interface BlogPost {
  _id: string;
  title: string;
  slug: string;
  language: "de" | "en";
  excerpt: string;
  body: string;
  mainImageUrl: string | null;
  author: string;
  publishedAt: number;
}

export function getPosts(language: "de" | "en"): Promise<BlogPost[]> {
  return convex.query(api.blogPosts.getAll, { language });
}

export function getPost(language: "de" | "en", slug: string): Promise<BlogPost | null> {
  return convex.query(api.blogPosts.getBySlug, { language, slug });
}
