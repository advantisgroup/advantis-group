import { getRequestConfig } from "next-intl/server";

export const locales = ["de", "en", "zh", "fr"] as const;
export const defaultLocale = "de" as const;

export type Locale = (typeof locales)[number];

export default getRequestConfig(async ({ locale }) => {
  const resolvedLocale = locale ?? defaultLocale;

  return {
    locale: resolvedLocale,
    messages: (
      (await import(`./messages/${resolvedLocale}.json`)) as {
        default: Record<string, string>;
      }
    ).default,
  };
});
