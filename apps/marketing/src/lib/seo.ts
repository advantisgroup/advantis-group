import { defaultLocale, locales } from "@/i18n/request";

export const SITE_URL = "https://advantisgroup.de";

/** Path for one locale. `path` is "" for the home page, otherwise "/about" etc. */
export function localePath(locale: string, path = "") {
  return `/${locale}${path}`;
}

/** For pages that only make sense to the person looking at them — auth, account, token links. */
export const NO_INDEX = { index: false, follow: false } as const;

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
