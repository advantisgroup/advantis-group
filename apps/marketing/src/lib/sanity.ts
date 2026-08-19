import { createClient, type SanityClient } from "next-sanity";
import { createImageUrlBuilder } from "@sanity/image-url";
import type { Image } from "sanity";
import type { PortableTextBlock } from "@portabletext/react";

export const SANITY_PROJECT_ID = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "";
export const SANITY_DATASET = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";

export const sanityClient: SanityClient = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  apiVersion: "2025-01-01",
  useCdn: true,
});

const imageBuilder = createImageUrlBuilder(sanityClient);

export function urlForImage(source: Image) {
  return imageBuilder.image(source);
}

export interface BlogPost {
  _id: string;
  title: string;
  slug: string;
  language: "de" | "en";
  excerpt: string;
  mainImage?: Image;
  author?: string;
  publishedAt: string;
  body?: PortableTextBlock[];
}

const POST_FIELDS = `
  _id,
  title,
  "slug": slug.current,
  language,
  excerpt,
  mainImage,
  author,
  publishedAt,
  body
`;

export async function getPosts(language: "de" | "en"): Promise<BlogPost[]> {
  return sanityClient.fetch(
    `*[_type == "post" && language == $language] | order(publishedAt desc) { ${POST_FIELDS} }`,
    { language },
    { next: { tags: ["post"] } },
  );
}

export async function getPost(language: "de" | "en", slug: string): Promise<BlogPost | null> {
  return sanityClient.fetch(
    `*[_type == "post" && language == $language && slug.current == $slug][0] { ${POST_FIELDS} }`,
    { language, slug },
    { next: { tags: ["post", `post:${slug}`] } },
  );
}
