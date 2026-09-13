import type { ReactNode } from "react";

import { Geist, Geist_Mono } from "next/font/google";

import { ClerkProvider } from "@clerk/nextjs";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ClientErrorReporter } from "@/components/ClientErrorReporter";
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      // One design now, so it's stamped at render instead of mirrored from a
      // preference after it loads — no first paint in the old look.
      data-design="refreshed"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="bg-background text-foreground antialiased">
        <ClerkProvider>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <ConvexClientProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                <ClientErrorReporter />
                {children}
                {/* Lifted clear of the two things that live in the same
                    corner: the AI dock on desktop, the bottom nav pill on a
                    phone — both were getting covered by a toast. */}
                <Toaster
                  position="bottom-right"
                  offset={{ bottom: "5.5rem", right: "1.5rem" }}
                  mobileOffset={{ bottom: "6.25rem", left: "1rem", right: "1rem" }}
                />
              </ThemeProvider>
            </ConvexClientProvider>
          </NextIntlClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
