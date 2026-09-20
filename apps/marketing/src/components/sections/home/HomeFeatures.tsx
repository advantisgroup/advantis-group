"use client";

import { useTranslations } from "next-intl";

import { Section, SectionHead, StatRow } from "@/components/frame";

/**
 * Why us: three principles, then the figures behind them.
 *
 * This used to be a bento — a five-by-two hairline grid with the heading
 * parked in its right half and cells at four different sizes. It gave the
 * section a shape, but the shape was the only thing it gave: three claims of
 * equal weight were drawn at three different weights, which told the reader
 * a ranking that isn't there.
 */
export const HomeFeatures = () => {
  const t = useTranslations("features");

  const principles = [
    { title: t("feature1.title"), description: t("feature1.description") },
    { title: t("feature2.title"), description: t("feature2.description") },
    { title: t("feature3.title"), description: t("feature3.description") },
  ];

  const stats = [
    { value: 15, suffix: "+", label: t("stats.experience") },
    { value: 150, suffix: "+", label: t("stats.projects") },
    { value: 4, label: t("stats.brands") },
    { value: 100, suffix: "%", label: t("stats.passion") },
  ];

  return (
    <Section size="loose">
      <SectionHead
        title={
          <>
            {t("title")} <span className="whitespace-nowrap">{t("titleBrand")}?</span>
          </>
        }
        lede={t("subtitle")}
      />

      <div className="mt-16 grid gap-10 md:grid-cols-3 md:gap-8">
        {principles.map((principle) => (
          <div key={principle.title} className="border-t border-rule pt-6">
            <h3 className="text-lg font-semibold tracking-[-0.01em]">{principle.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {principle.description}
            </p>
          </div>
        ))}
      </div>

      <StatRow items={stats} className="mt-20 lg:grid-cols-4" />
    </Section>
  );
};
