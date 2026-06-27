import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Manrope, Outfit } from "next/font/google";

import { ClerkProvider } from "@clerk/nextjs";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

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

export const metadata: Metadata = {
  title: "Advantis Intranet",
  description: "Internal portal for Advantis Group employees",
  robots: { index: false, follow: false },
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
      className={`${outfit.variable} ${manrope.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ClerkProvider
          publishableKey={
            process.env.NEXT_PUBLIC_INTRANET_CLERK_PUBLISHABLE_KEY
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
