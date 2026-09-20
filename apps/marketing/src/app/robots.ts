import { type MetadataRoute } from "next";

import { locales } from "@/i18n/request";
import { SITE_URL } from "@/lib/seo";

const PRIVATE_PATHS = ["/account", "/sign-in", "/sign-up", "/api"];

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
