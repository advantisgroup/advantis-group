"use client";

import Image from "next/image";

import { useTranslations } from "next-intl";

const SALES_CLUB_YEARS = ["2024", "2025", "2026"] as const;

export const TrustBadges = () => {
  const t = useTranslations("trustBadges");

  return (
    <section className="relative overflow-hidden py-10 md:py-14">
      <div className="container relative z-10 mx-auto px-4">
        <div className="mx-auto max-w-4xl space-y-8 text-center">
          <p className="font-[family-name:var(--font-outfit)] text-xs uppercase tracking-[0.35em] text-primary/80">
            {t("title")}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
            <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
              {SALES_CLUB_YEARS.map((year) => (
                <div
                  key={year}
                  className="relative h-20 w-20 opacity-80 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0 sm:h-24 sm:w-24"
                >
                  <Image
                    src={`/badges/sales-presidents-club-${year}.png`}
                    alt={t("salesClub", { year })}
                    fill
                    sizes="96px"
                    className="object-contain"
                  />
                </div>
              ))}
            </div>

            <div className="hidden h-16 w-px bg-border sm:block" aria-hidden />

            <div className="relative h-20 w-20 opacity-80 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0 sm:h-24 sm:w-24">
              <Image
                src="/badges/dsgvo-konform.png"
                alt={t("dsgvo")}
                fill
                sizes="96px"
                className="object-contain"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
