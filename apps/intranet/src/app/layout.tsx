import type { Metadata } from "next";

import { ClerkProvider } from "@clerk/nextjs";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

export const metadata: Metadata = {
  title: "Advantis Intranet",
  description: "Internal portal for Advantis Group employees",
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ClerkProvider>
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
