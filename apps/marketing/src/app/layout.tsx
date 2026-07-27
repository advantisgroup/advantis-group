import React from "react";

import { Outfit, Manrope } from "next/font/google";

import { ClerkProvider } from "@clerk/nextjs";
import { type Metadata } from "next";

import "./global.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import SmoothScrolling from "@/components/effects/SmoothScrolling";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = {
  title: {
    default: "advantis GmbH",
    template: "%s | advantis GmbH",
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
    "Advantis Group",
    "Marketingstrategie",
  ],
  authors: [{ name: "advantis GmbH" }],
  creator: "advantis GmbH",
  metadataBase: new URL("https://advantisgroup.de"),
  openGraph: {
    type: "website",
    locale: "de_DE",
    url: "https://advantisgroup.de",
    title: "advantis GmbH",
    description:
      "Ganzheitliche Sales Power: von Marketingstrategie und Leadgenerierung über Akquise Support, Sales Trainings bis hin zur Implementierung von KI-Tools.",
    siteName: "advantis GmbH",
    images: [
      {
        url: "/base_logo_transparent_background.png",
        width: 1200,
        height: 630,
        alt: "advantis GmbH Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "advantis GmbH",
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
        className={`bg-background antialiased scroll-smooth ${manrope.variable} ${outfit.variable}`}
      >
        <ClerkProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
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
