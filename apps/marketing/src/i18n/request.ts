import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

export const locales = ["de", "en", "zh", "fr"] as const;
export const defaultLocale = "de" as const;

export type Locale = (typeof locales)[number];

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const resolvedLocale = hasLocale(locales, requested) ? requested : defaultLocale;

  return {
    locale: resolvedLocale,
    messages: (
      (await import(`./messages/${resolvedLocale}.json`)) as {
        default: Record<string, string>;
      }
    ).default,
  };
});
