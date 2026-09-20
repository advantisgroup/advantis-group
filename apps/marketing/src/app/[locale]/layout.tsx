import React, { Suspense } from "react";

import { notFound } from "next/navigation";

import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import { AnalyticsTracker } from "@/components/analytics/AnalyticsTracker";
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
  );
}
