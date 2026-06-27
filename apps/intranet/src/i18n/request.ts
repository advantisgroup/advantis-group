import { cookies } from "next/headers";

import { getRequestConfig } from "next-intl/server";

import { defaultLocale, LOCALE_COOKIE, type Locale, locales } from "./config";

export { defaultLocale, LOCALE_COOKIE, locales };
export type { Locale };

export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale = (locales as readonly string[]).includes(cookieLocale ?? "")
    ? (cookieLocale as Locale)
    : defaultLocale;

  return {
    locale,
    messages: (
      (await import(`./messages/${locale}.json`)) as {
        default: Record<string, unknown>;
      }
    ).default,
  };
});
