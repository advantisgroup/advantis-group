"use client";

import type { ReactNode } from "react";

import Image from "next/image";

import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { BrandLogo } from "@/components/Logo";

const HIGHLIGHTS = [
  "Termine, Abwesenheiten & Ankündigungen an einem Ort",
  "Direkter Draht zum gesamten Team per Chat",
  "Sicher — nur für Advantis Mitarbeitende",
];

export function AuthShell({ children }: { children: ReactNode }) {
  const t = useTranslations("Nav");

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* atmosphere */}
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
          <h1 className="font-display text-4xl font-bold leading-[1.1] tracking-tight text-white">
            Willkommen im Advantis Intranet.
          </h1>
          <p className="mt-4 text-base text-white/80">
            Dein Arbeitsplatz für alles, was im Team passiert.
          </p>
          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map(item => (
              <li
                key={item}
                className="flex items-start gap-3 text-sm text-white/90"
              >
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
      <div className="app-atmosphere relative flex flex-col items-center justify-center px-4 py-12">
        <div className="mb-8 lg:hidden">
          <BrandLogo />
        </div>
        {children}
        <div className="mt-8 flex items-center gap-4 text-xs text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">
            {t("privacy")}
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            {t("terms")}
          </Link>
          <Link href="/imprint" className="hover:text-foreground">
            {t("imprint")}
          </Link>
        </div>
      </div>
    </div>
  );
}
