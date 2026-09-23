import React, { type ComponentProps, Suspense } from "react";

import { notFound } from "next/navigation";

import { ClerkProvider } from "@clerk/nextjs";
import { deDE, enUS, frFR, zhCN } from "@clerk/localizations";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import { AnalyticsTracker } from "@/components/analytics/AnalyticsTracker";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { type Locale, locales } from "@/i18n/request";
import { COMPANY_ADDRESS } from "@/lib/company";
import { SITE_URL } from "@/lib/seo";

const [streetAddress, postalAndCity] = COMPANY_ADDRESS.split(", ");
const [postalCode, addressLocality] = postalAndCity.split(/ (.+)/);

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "ADVANTIS GROUP",
  url: SITE_URL,
  logo: `${SITE_URL}/base_logo_transparent_background.png`,
  address: {
    "@type": "PostalAddress",
    streetAddress,
    postalCode,
    addressLocality,
    addressCountry: "DE",
  },
};

// so Clerk's sign-in, sign-up and profile screens speak the page's language. The
// cast is only because the two packages pull in different copies of @clerk/shared;
// the data is the same shape. The package is pinned to match @clerk/nextjs.
const CLERK_LOCALIZATION = { de: deDE, en: enUS, fr: frFR, zh: zhCN } as Record<
  Locale,
  ComponentProps<typeof ClerkProvider>["localization"]
>;

// eslint-disable-next-line react-refresh/only-export-components
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  const messages = await getMessages({ locale });

  return (
    <ClerkProvider localization={CLERK_LOCALIZATION[locale as Locale]}>
      <ConvexClientProvider>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
          />
          <Header />
          {children}
          <Footer />
          {/* Suspense because the tracker reads `?r=` via useSearchParams, which
          would otherwise opt every static page out of prerendering. */}
          <Suspense fallback={null}>
            <AnalyticsTracker />
          </Suspense>
        </NextIntlClientProvider>
      </ConvexClientProvider>
    </ClerkProvider>
  );
}
