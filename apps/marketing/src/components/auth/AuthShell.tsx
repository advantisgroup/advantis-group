"use client";

import type { ReactNode } from "react";

import Image from "next/image";

import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

/**
 * Marketing's take on the intranet's two-panel AuthShell
 * (apps/intranet/src/components/layout/AuthShell.tsx): same visual
 * structure, but customer-facing copy that never mentions the intranet, and
 * localized across all four marketing locales.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const locale = useLocale();
  const t = useTranslations("auth");
  const tNav = useTranslations("nav");
  const highlights = t.raw("authShellHighlights") as string[];

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "34px 34px",
          }}
        />
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-black/20 blur-3xl" />

        <div className="relative">
          <Image
            src="/white_logo_transparent_background.png"
            alt="Advantis Group"
            width={150}
            height={36}
            priority
            className="h-9 w-auto object-contain"
          />
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-white">
            {title}
          </h1>
          <p className="mt-4 text-base text-white/80">{subtitle}</p>
          <ul className="mt-8 space-y-3">
            {highlights.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-white/90">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-xs text-white/60">
          © {new Date().getFullYear()} advantis GmbH
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex flex-col items-center justify-center bg-background px-4 py-12">
        <div className="mb-8 lg:hidden">
          <Image
            src="/base_logo_transparent_background.png"
            alt="Advantis Group"
            width={150}
            height={36}
            priority
            className="h-9 w-auto object-contain"
          />
        </div>
        {children}
        <div className="mt-8 flex items-center gap-4 text-xs text-muted-foreground">
          <Link href="/privacy" locale={locale} className="hover:text-foreground">
            {tNav("privacy")}
          </Link>
          <Link href="/imprint" locale={locale} className="hover:text-foreground">
            {tNav("imprint")}
          </Link>
        </div>
      </div>
    </div>
  );
}
