"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandText } from "@/components/effects/BrandText";
import { Reveal } from "@/components/effects/Reveal";
import { Display, Section, SectionHead } from "@/components/frame";
import { BrandScene } from "@/components/illustrations/HomeIllustrations";
import { Link } from "@/i18n/navigation";
import { BRANDS } from "@/lib/brands";

/**
 * Four brands, four cards, each opening on a drawing of what that brand
 * does, in its own colour on a wash of it.
 *
 * This is the one section where several accents belong on screen together:
 * the point being made is that the group is four different things. The two
 * unlaunched brands keep their colour in the drawing, on a fainter wash —
 * their wordmark stays grey and carries the "coming soon".
 */
export const HomeBrands = () => {
  const t = useTranslations("brands");

  return (
    <Section size="loose">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <SectionHead
          align="left"
          title={
            <>
              {t("title")} <span className="text-primary">{t("titleHighlight")}</span>
            </>
          }
          lede={t("subtitle")}
        />
        <Link
          href="/brands"
          className="group inline-flex shrink-0 items-center gap-2 text-sm font-medium"
        >
          {t("cta")}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <ul className="mt-14 grid gap-4 md:grid-cols-2">
        {BRANDS.map((brand, index) => {
          const live = brand.status === "live";

          return (
            <Reveal as="li" key={brand.key} delay={index * 0.08}>
              <Link
                href={`/brands#${brand.brandText}`}
                className="group flex h-full flex-col overflow-hidden rounded-xl border border-rule bg-card transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-1 hover:border-rule-strong hover:shadow-overlay"
              >
                <BrandScene
                  brand={brand.key}
                  accent={brand.accent}
                  // The unlaunched two get a fainter wash; the grey wordmark and the badge say "not yet".
                  ground={`color-mix(in oklch, ${brand.accent} ${live ? 12 : 6}%, var(--card))`}
                />

                <div className="flex flex-1 flex-col p-6 md:p-8">
                  <Display size="md" as="p">
                    {live ? (
                      <BrandText brand={brand.brandText} hoverable={false}>
                        {brand.name}
                      </BrandText>
                    ) : (
                      <span className="text-muted-foreground/70">{brand.name}</span>
                    )}
                  </Display>
                  <span className="mt-3 flex flex-wrap items-center gap-2.5">
                    <span className="text-[13px] font-medium">{t(`${brand.key}.tagline`)}</span>
                    {live ? null : (
                      <span className="rounded-full border border-rule px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {t("comingSoon")}
                      </span>
                    )}
                  </span>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">
                    {t(`${brand.key}.description`)}
                  </p>
                  <span className="mt-auto pt-6">
                    <ArrowRight className="size-4 text-muted-foreground transition-[color,transform] group-hover:translate-x-1 group-hover:text-foreground" />
                  </span>
                </div>
              </Link>
            </Reveal>
          );
        })}
      </ul>
    </Section>
  );
};
