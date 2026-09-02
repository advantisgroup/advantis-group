"use client";

import { ArrowRight, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandText } from "@/components/effects/BrandText";
import { Display, PageField } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { BRANDS } from "@/lib/brands";

export default function UnsereMarken() {
  const t = useTranslations("brandsPage");

  return (
    <div className="relative min-h-screen bg-background">
      <PageField />

      <div className="relative">
        <section className="relative pt-32 pb-20 md:pt-44 md:pb-28">
          <div className="mx-auto w-full max-w-[1440px] px-5 md:px-10">
            <Display as="h1" size="xl" className="max-w-[12ch]">
              {t("hero.titlePrefix")} <span className="text-primary">{t("hero.titleSuffix")}</span>
            </Display>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-2xl">
              {t("hero.subtitle")}
            </p>
          </div>
        </section>

        {/*
         * One band per brand rather than four rows of a table. Each carries its
         * own accent — wash, rule, index and highlight markers all recolour
         * together — so scrolling the page moves through four distinct
         * identities instead of one list.
         */}
        {BRANDS.map((brand, index) => (
          <section
            key={brand.key}
            id={brand.brandText}
            className="relative overflow-hidden border-t border-rule py-16 md:py-24"
            style={{ "--brand-accent": brand.accent } as React.CSSProperties}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(75% 90% at 0% 0%, color-mix(in oklch, var(--brand-accent) 12%, transparent), transparent 65%)",
              }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-1"
              style={{ background: "var(--brand-accent)" }}
            />

            <div className="relative mx-auto w-full max-w-[1440px] px-5 md:px-10">
              <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
                <div>
                  <span
                    className="font-mono text-[11px] tracking-[0.28em]"
                    style={{ color: "var(--brand-accent)" }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <h2 className="mt-5 font-[family-name:var(--font-outfit)] text-4xl font-bold leading-none tracking-[-0.04em] md:text-6xl lg:text-7xl">
                    <BrandText brand={brand.brandText} hoverable={false}>
                      {brand.name}
                    </BrandText>
                  </h2>

                  <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    {t(`items.${brand.key}.tagline`)}
                  </p>

                  <Button
                    asChild
                    variant="outline"
                    className="group mt-9 rounded-none border-rule-strong"
                  >
                    <Link href={brand.url} target="_blank" rel="noopener noreferrer">
                      {t("learnMore")}
                      <ExternalLink className="ml-2 size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </Link>
                  </Button>
                </div>

                <div>
                  <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
                    {t(`items.${brand.key}.description`)}
                  </p>

                  <ul className="mt-8 border-t border-rule">
                    {[0, 1, 2].map((highlight) => (
                      <li
                        key={highlight}
                        className="flex items-center gap-4 border-b border-rule py-3.5"
                      >
                        <span
                          aria-hidden
                          className="size-1.5 shrink-0"
                          style={{ background: "var(--brand-accent)" }}
                        />
                        <span className="text-sm md:text-base">
                          {t(`items.${brand.key}.highlights.${highlight}`)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        ))}

        <section className="grain relative overflow-hidden border-t border-rule py-24 md:py-36">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(80% 70% at 50% 108%, color-mix(in oklch, var(--primary) 24%, transparent), transparent 70%)",
            }}
          />

          <div className="relative mx-auto w-full max-w-[1440px] px-5 md:px-10">
            <div className="mx-auto max-w-3xl text-center">
              <Display as="h2" size="lg">
                {t("cta.titlePart1")} <span className="text-primary">{t("cta.titlePart2")}</span>
              </Display>
              <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
                {t("cta.description")}
              </p>
              <Button asChild size="lg" className="mt-10 rounded-none">
                <Link href="/contact">
                  {t("cta.button")}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
