import { clerkMiddleware } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";

import { defaultLocale, locales } from "./i18n/request";

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always",
});

export default clerkMiddleware(async (auth, req) => {
  const pathname = req.nextUrl.pathname;

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/trpc") ||
    pathname.startsWith("/content") ||
    // Short share links carry no locale segment — the post's own language
    // decides where the redirect lands (see app/share/blog/[code]/route.ts).
    pathname.startsWith("/share")
  ) {
    return;
  }

  // The account area needs a session. Sending people to sign-in from here
  // keeps the exact page they asked for (an inquiry, the privacy page…) as
  // the place they land afterwards.
  const [locale, section] = pathname.split("/").filter(Boolean);
  if (section === "account" && (locales as readonly string[]).includes(locale)) {
    const { userId } = await auth();
    if (!userId) {
      const signIn = req.nextUrl.clone();
      signIn.pathname = `/${locale}/sign-in`;
      signIn.search = `?redirect_url=${encodeURIComponent(pathname + req.nextUrl.search)}`;
      return NextResponse.redirect(signIn);
    }
  }

  return intlMiddleware(req);
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
