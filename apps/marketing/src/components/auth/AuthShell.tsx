"use client";

import type { ReactNode } from "react";

import { ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Logo } from "@/components/brand/Logo";
import { Display } from "@/components/frame";
import { LANGUAGES, useSwitchLocale } from "@/components/layout/SettingsMenu";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Marketing's take on the intranet's two-panel AuthShell
 * (apps/intranet/src/components/layout/AuthShell.tsx): same visual
 * structure, but customer-facing copy that never mentions the intranet, and
 * localized across all four marketing locales.
 *
 * The site's header and footer are hidden here, so this shell carries the
 * way home and the language switch itself — otherwise the page is a dead end.
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
  const switchLocale = useSwitchLocale();
  const highlights = t.raw("authShellHighlights") as string[];

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/*
       * Brand panel. It used to be a solid field of the Advantis red with a
       * white grid ruled over it and two blurred blobs in the corners — a
       * whole screen spending the accent, plus decoration that says nothing.
       * Inverted ink, the real lockup, and the three things we actually claim.
       */}
      <div className="hidden bg-foreground text-background lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Link href="/" locale={locale} aria-label="ADVANTIS GROUP" className="self-start">
          <Logo inverse height={20} alt="" />
        </Link>

        <div className="max-w-md">
          <Display as="h1" size="lg">
            {title}
          </Display>
          <p className="mt-5 text-base leading-relaxed text-background/70">{subtitle}</p>
          <ul className="mt-10">
            {highlights.map((item) => (
              <li key={item} className="border-t border-background/15 py-3 text-sm last:border-b">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="text-xs text-background/70">
          © {new Date().getFullYear()} ADVANTIS GROUP.
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex flex-col items-center justify-center bg-background px-4 py-12">
        <Link href="/" locale={locale} aria-label="ADVANTIS GROUP" className="mb-8 lg:hidden">
          <Logo height={20} />
        </Link>
        {children}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <Link
            href="/"
            locale={locale}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-3" />
            {t("backToSite")}
          </Link>
          <Link href="/privacy" locale={locale} className="hover:text-foreground">
            {tNav("privacy")}
          </Link>
          <Link href="/imprint" locale={locale} className="hover:text-foreground">
            {tNav("imprint")}
          </Link>
          <span aria-hidden className="h-3 w-px bg-rule-strong" />
          <nav aria-label={tNav("settingsMenu.language")} className="flex items-center gap-2">
            {LANGUAGES.map((language) => (
              <button
                key={language.code}
                type="button"
                lang={language.code}
                title={language.name}
                aria-current={language.code === locale ? "true" : undefined}
                onClick={() => switchLocale(language.code)}
                className={cn(
                  "hover:text-foreground",
                  language.code === locale && "font-medium text-foreground",
                )}
              >
                {language.code === "zh" ? language.name : language.code.toUpperCase()}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
