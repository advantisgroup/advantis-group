import React, { type ComponentProps, Suspense } from "react";

import { JetBrains_Mono, Manrope, Newsreader } from "next/font/google";
import { notFound } from "next/navigation";

import { ClerkProvider } from "@clerk/nextjs";
import { enUS, frFR, zhCN } from "@clerk/localizations";
import { type Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import "../global.css";
import { AnalyticsTracker } from "@/components/analytics/AnalyticsTracker";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import SmoothScrolling from "@/components/effects/SmoothScrolling";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { PrintInLightTheme } from "@/components/print/PrintInLightTheme";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { type Locale, locales } from "@/i18n/request";
import { deDU } from "@/lib/clerk-de";
import { COMPANY_ADDRESS } from "@/lib/company";
import { SITE_URL } from "@/lib/seo";

/**
 * The site runs on two faces with strict roles: a bookish serif for anything
 * the page is actually *saying* — headlines, pull quotes, figures — and a
 * neutral sans for everything that is chrome around it: navigation, buttons,
 * labels, body copy. Mixing the two roles is what makes a page look busy, so
 * the serif never appears in UI and the sans never appears at display size.
 */
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  style: ["normal", "italic"],
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

// Code blocks in blog posts, and nothing else.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const DESCRIPTION =
  "Ganzheitliche Sales Power: von Marketingstrategie und Leadgenerierung über Akquise Support, Sales Trainings bis hin zur Implementierung von KI-Tools.";

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = {
  title: {
    default: "ADVANTIS GROUP",
    template: "%s | ADVANTIS GROUP",
  },
  description: DESCRIPTION,
  keywords: [
    "Sales",
    "Vertrieb",
    "Marketing",
    "Leadgenerierung",
    "Akquise",
    "Sales Training",
    "KI-Tools",
    "ADVANTIS GROUP",
    "Marketingstrategie",
  ],
  authors: [{ name: "ADVANTIS GROUP" }],
  creator: "ADVANTIS GROUP",
  metadataBase: new URL("https://advantisgroup.de"),
  openGraph: {
    type: "website",
    locale: "de_DE",
    url: "https://advantisgroup.de",
    title: "ADVANTIS GROUP",
    description: DESCRIPTION,
    siteName: "ADVANTIS GROUP",
    images: [
      {
        url: "/base_logo_transparent_background.png",
        width: 1200,
        height: 630,
        alt: "ADVANTIS GROUP Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ADVANTIS GROUP",
    description: DESCRIPTION,
    images: ["/base_logo_transparent_background.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
};

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
const CLERK_LOCALIZATION = { de: deDU, en: enUS, fr: frFR, zh: zhCN } as Record<
  Locale,
  ComponentProps<typeof ClerkProvider>["localization"]
>;

// eslint-disable-next-line react-refresh/only-export-components
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/**
 * The root layout. It lives under [locale] rather than at app/layout.tsx so
 * <html lang> can be the page's actual language; unknown URLs outside a
 * locale are handled by global-not-found.tsx.
 */
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

  setRequestLocale(locale);
  const messages = await getMessages({ locale });

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`bg-background antialiased scroll-smooth ${manrope.variable} ${newsreader.variable} ${jetbrainsMono.variable}`}
      >
        {/* Ivory is the designed canvas; dark is the alternate, not a coin flip
            on the visitor's OS setting. "System" is still offered in settings. */}
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <PrintInLightTheme />
          <SmoothScrolling>
            <ClerkProvider
              localization={CLERK_LOCALIZATION[locale as Locale]}
              // Clerk's styles go in their own layer so the Tailwind classes we hand
              // it through `appearance.elements` win (see the @layer order in global.css)
              appearance={{ cssLayerName: "clerk" }}
            >
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
            <Toaster />
          </SmoothScrolling>
        </ThemeProvider>
      </body>
    </html>
  );
}
