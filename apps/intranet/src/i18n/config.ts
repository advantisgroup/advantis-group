// Client-safe i18n constants. No server-only imports here so this can be
// imported from both client components and server modules.
export const locales = ["de", "en"] as const;
export const defaultLocale = "de" as const;
export type Locale = (typeof locales)[number];

export const LOCALE_COOKIE = "NEXT_LOCALE";
