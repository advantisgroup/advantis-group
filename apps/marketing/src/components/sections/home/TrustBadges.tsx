"use client";

import Image from "next/image";

import { useTranslations } from "next-intl";

import { Display, Section } from "@/components/frame";

const SALES_CLUB_YEARS = ["2024", "2025", "2026"] as const;

/**
 * The proof bar: the claims spelled out as a ledger, the badges themselves as
 * the evidence beside them.
 */
export const TrustBadges = () => {
  const t = useTranslations("trustBadges");

  const ledger = [
    ...SALES_CLUB_YEARS.map((year) => ({
      key: year,
      text: t("salesClub", { year }),
      src: `/badges/sales-presidents-club-${year}.png`,
    })),
    { key: "dsgvo", text: t("dsgvo"), src: "/badges/dsgvo-konform.png" },
  ];

  return (
    <Section size="tight">
      <Display size="sm" className="max-w-[16ch]">
        {t("title")}
      </Display>

      <div className="mt-10 grid gap-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-16">
        <ul className="border-t border-rule">
          {ledger.map((entry) => (
            <li
              key={entry.key}
              className="flex items-center gap-3 border-b border-rule py-3 font-mono text-xs tracking-wide text-muted-foreground"
            >
              <span aria-hidden className="text-primary">
                ✓
              </span>
              {entry.text}
            </li>
          ))}
        </ul>

        <div>
          <div className="flex flex-wrap items-center gap-6 sm:gap-8">
            {ledger.map((entry) => (
              <div
                key={entry.key}
                className="relative size-20 opacity-70 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0 sm:size-24"
              >
                <Image
                  src={entry.src}
                  alt={entry.text}
                  fill
                  sizes="96px"
                  className="object-contain"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
};
