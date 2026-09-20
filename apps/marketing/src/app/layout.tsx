import React from "react";

import { JetBrains_Mono, Manrope, Newsreader } from "next/font/google";

import { ClerkProvider } from "@clerk/nextjs";
import { type Metadata } from "next";

import "./global.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import SmoothScrolling from "@/components/effects/SmoothScrolling";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";

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

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = {
  title: {
    default: "ADVANTIS GROUP",
    template: "%s | ADVANTIS GROUP",
  },
  description:
    "Ganzheitliche Sales Power: von Marketingstrategie und Leadgenerierung über Akquise Support, Sales Trainings bis hin zur Implementierung von KI-Tools.",
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
    description:
      "Ganzheitliche Sales Power: von Marketingstrategie und Leadgenerierung über Akquise Support, Sales Trainings bis hin zur Implementierung von KI-Tools.",
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
    description:
      "Ganzheitliche Sales Power: von Marketingstrategie und Leadgenerierung über Akquise Support, Sales Trainings bis hin zur Implementierung von KI-Tools.",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body
        className={`bg-background antialiased scroll-smooth ${manrope.variable} ${newsreader.variable} ${jetbrainsMono.variable}`}
      >
        <ClerkProvider>
          {/* Ivory is the designed canvas; dark is the alternate, not a coin flip
              on the visitor's OS setting. "System" is still offered in settings. */}
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
            <SmoothScrolling>
              <ConvexClientProvider>
                {children}
                <Toaster />
              </ConvexClientProvider>
            </SmoothScrolling>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
