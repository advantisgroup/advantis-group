/* eslint-disable react-refresh/only-export-components --
   Next.js requires `metadata` and `viewport` to be exported from this layout. */
import type { ReactNode } from "react";

import { Geist, Geist_Mono } from "next/font/google";

import { ClerkProvider } from "@clerk/nextjs";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import type { Metadata, Viewport } from "next";

import "./globals.css";

// Geist Sans/Mono (Vercel, OFL-1.1 licensed) stand in for Anthropic's
// commissioned Anthropic Sans/Mono type family — same geometric-grotesk
// feel, but under a license that's actually clear to ship. See
// globals.css's font-family declarations for how these apply.
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Advantis Intranet",
  description: "Internal portal for Advantis Group employees",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "Advantis",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Cover the display so safe-area insets work on notched phones; the
  // mobile bottom nav and dialogs pad themselves against these insets.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f3ec" },
    { media: "(prefers-color-scheme: dark)", color: "#211e1b" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="bg-background text-foreground antialiased">
        <ClerkProvider
          publishableKey={
            process.env.NEXT_PUBLIC_INTERNAL_CLERK_PUBLISHABLE_KEY
          }
        >
          <NextIntlClientProvider locale={locale} messages={messages}>
            <ConvexClientProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                {children}
                <Toaster richColors position="top-right" />
              </ThemeProvider>
            </ConvexClientProvider>
          </NextIntlClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
