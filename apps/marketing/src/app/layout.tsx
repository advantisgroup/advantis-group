import React from "react";

import { JetBrains_Mono, Outfit, Manrope } from "next/font/google";

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

/**
 * The technical micro-labels (section indices, schematic node names, spec
 * rows) are set in mono. It is load-bearing for the layout language, not
 * decoration — the grid reads as a technical drawing because of it.
 */
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
        className={`bg-background antialiased scroll-smooth ${manrope.variable} ${outfit.variable} ${jetbrainsMono.variable}`}
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
