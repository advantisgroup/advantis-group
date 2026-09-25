import { type MetadataRoute } from "next";

import { locales } from "@/i18n/request";
import { SITE_URL } from "@/lib/seo";

// sign-in/up stay crawlable so crawlers can see their noindex; a disallowed page can still be listed
const PRIVATE_PATHS = ["/account", "/api"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Every page lives under a locale prefix, so block those too.
      disallow: [
        ...PRIVATE_PATHS,
        ...locales.flatMap((locale) => PRIVATE_PATHS.map((path) => `/${locale}${path}`)),
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
