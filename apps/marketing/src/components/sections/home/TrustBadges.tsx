"use client";

import Image from "next/image";

import { useTranslations } from "next-intl";

import { Reveal } from "@/components/effects/Reveal";
import { Display, Section, StatRow } from "@/components/frame";
import { AwardPodium } from "@/components/illustrations/HomeIllustrations";

const SALES_CLUB_YEARS = ["2024", "2025", "2026"] as const;

/**
 * The proof band: the figures, then the awards, each badge captioned with
 * what it is.
 *
 * The figures used to close the "why us" section and the badges had a
 * section of their own, with every claim written out twice — once in a list,
 * once as the badge's alt text beside it. Together they are one argument,
 * so they share one band.
 *
 * The badges are not desaturated-until-hover. A greyed-out award is a
 * strange thing to print — either it counts or it doesn't.
 */
export const TrustBadges = () => {
  const t = useTranslations("trustBadges");
  const features = useTranslations("features");

  const stats = [
    { value: 15, suffix: "+", label: features("stats.experience") },
    { value: 150, suffix: "+", label: features("stats.projects") },
    { value: 4, label: features("stats.brands") },
    { value: 100, suffix: "%", label: features("stats.passion") },
  ];

  const badges = [
    ...SALES_CLUB_YEARS.map((year) => ({
      key: year,
      text: t("salesClub", { year }),
      src: `/badges/sales-presidents-club-${year}.png`,
    })),
    { key: "dsgvo", text: t("dsgvo"), src: "/badges/dsgvo-konform.png" },
  ];

  return (
    <Section tone="raised">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
        <div>
          <Display size="md" className="max-w-[14ch]">
            {t("title")}
          </Display>
          <AwardPodium className="mt-8 max-w-xs" />
        </div>

        <StatRow items={stats} className="lg:grid-cols-2 lg:self-center xl:grid-cols-4" />
      </div>

      <ul className="mt-16 grid grid-cols-2 gap-x-6 gap-y-10 border-t border-rule-strong pt-12 sm:grid-cols-4 md:mt-20">
        {badges.map((badge, index) => (
          <Reveal as="li" key={badge.key} delay={index * 0.08} className="flex items-center gap-4">
            <div className="relative size-16 shrink-0 sm:size-20">
              <Image src={badge.src} alt="" fill sizes="80px" className="object-contain" />
            </div>
            <span className="text-sm leading-snug text-muted-foreground">{badge.text}</span>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
};
