import { defaultLocale, locales } from "@/i18n/request";

export const SITE_URL = "https://advantisgroup.de";

/** Path for one locale. `path` is "" for the home page, otherwise "/about" etc. */
export function localePath(locale: string, path = "") {
  return `/${locale}${path}`;
}

/** Canonical + hreflang links for a page that exists in every locale. */
export function localeAlternates(locale: string, path = "") {
  return {
    canonical: localePath(locale, path),
    languages: {
      ...Object.fromEntries(locales.map((l) => [l, localePath(l, path)])),
      "x-default": localePath(defaultLocale, path),
    },
  };
}
