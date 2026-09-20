"use client";

import Image from "next/image";

import { useTranslations } from "next-intl";

import { Display, Section } from "@/components/frame";

const SALES_CLUB_YEARS = ["2024", "2025", "2026"] as const;

/**
 * The proof bar: the badges as evidence, the claims spelled out beside them.
 *
 * The badges are no longer desaturated-until-hover. A greyed-out award is a
 * strange thing to print — either it counts or it doesn't.
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
    <Section size="normal">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-20">
        <div>
          <Display size="md" className="max-w-[18ch]">
            {t("title")}
          </Display>

          <ul className="mt-8">
            {ledger.map((entry) => (
              <li
                key={entry.key}
                className="border-t border-rule py-3 text-sm text-muted-foreground last:border-b"
              >
                {entry.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-8 lg:justify-end">
          {ledger.map((entry) => (
            <div key={entry.key} className="relative size-20 sm:size-24">
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
    </Section>
  );
};
