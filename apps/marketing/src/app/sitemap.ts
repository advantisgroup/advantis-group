import { type MetadataRoute } from "next";

import { locales } from "@/i18n/request";
import { getPosts } from "@/lib/blog";
import { localePath, SITE_URL } from "@/lib/seo";
import { SERVICE_SLUGS } from "@/lib/services";

const STATIC_PATHS = [
  "",
  "/about",
  "/brands",
  "/team",
  "/blog",
  "/whitepaper",
  "/contact",
  "/imprint",
  "/privacy",
  "/licenses",
  "/cookies",
  ...SERVICE_SLUGS.map((slug) => `/services/${slug}`),
];

function absolute(locale: string, path: string) {
  return `${SITE_URL}${localePath(locale, path)}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = STATIC_PATHS.flatMap((path) =>
    locales.map((locale) => ({
      url: absolute(locale, path),
      alternates: {
        languages: Object.fromEntries(locales.map((l) => [l, absolute(l, path)])),
      },
    })),
  );

  // Posts only exist in one language, so they get a single entry with no
  // alternates. fr/zh show the English posts, so they're left out as duplicates.
  const posts: MetadataRoute.Sitemap = [];
  for (const language of ["de", "en"] as const) {
    try {
      for (const post of await getPosts(language)) {
        posts.push({
          url: absolute(language, `/blog/${post.slug}`),
          lastModified: new Date(post.publishedAt),
        });
      }
    } catch {
      // Convex being down shouldn't take the whole sitemap with it.
    }
  }

  return [...pages, ...posts];
}
