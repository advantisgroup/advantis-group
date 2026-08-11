"use client";

import { ArrowRight, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandText } from "@/components/effects/BrandText";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function UnsereMarken() {
  const t = useTranslations("brandsPage");

  const brands = [
    {
      name: "Salespirates",
      brand: "salespirates" as const,
      description: t("items.salespirates.description"),
      highlights: [
        t("items.salespirates.highlights.0"),
        t("items.salespirates.highlights.1"),
        t("items.salespirates.highlights.2"),
      ],
      url: "https://salespirates.de",
    },
    {
      name: "Rodeo-Consulting",
      brand: "rodeo" as const,
      description: t("items.rodeo.description"),
      highlights: [
        t("items.rodeo.highlights.0"),
        t("items.rodeo.highlights.1"),
        t("items.rodeo.highlights.2"),
      ],
      url: "https://rodeoconsulting.de",
    },
    {
      name: "Oldschool-train",
      brand: "oldschool-train" as const,
      description: t("items.oldschool.description"),
      highlights: [
        t("items.oldschool.highlights.0"),
        t("items.oldschool.highlights.1"),
        t("items.oldschool.highlights.2"),
      ],
      url: "https://oldschool-train.de",
    },
    {
      name: "Sales-AI-Germany",
      brand: "sales-ai-germany" as const,
      description: t("items.salesai.description"),
      highlights: [
        t("items.salesai.highlights.0"),
        t("items.salesai.highlights.1"),
        t("items.salesai.highlights.2"),
      ],
      url: "https://sales-ai-germany.de",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden border-b border-border/50 py-24 md:py-32">
        <div className="absolute inset-0 bg-linear-to-b from-background via-primary/5 to-background" />

        <div className="container relative z-10 mx-auto px-4">
          <div className="mx-auto max-w-5xl space-y-8 text-left">
            <h1 className="font-[family-name:var(--font-outfit)] text-5xl leading-[0.95] md:text-7xl lg:text-8xl">
              <span className="block">{t("hero.titlePrefix")}</span>
              <span className="block text-primary">{t("hero.titleSuffix")}</span>
            </h1>
            <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground md:text-2xl">
              {t("hero.subtitle")}
            </p>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-10 md:py-12">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-7xl border-y border-border/60">
            {brands.map((brand, index) => {
              return (
                <article
                  key={brand.brand}
                  id={brand.brand}
                  className="border-b border-border/60 px-0 py-10 last:border-b-0 md:py-14"
                >
                  <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr_auto] lg:items-start">
                    <div className="space-y-4">
                      <h2 className="font-[family-name:var(--font-outfit)] text-4xl leading-tight md:text-6xl">
                        <BrandText brand={brand.brand} hoverable={false}>
                          {brand.name}
                        </BrandText>
                      </h2>
                      <p className="max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                        {brand.description}
                      </p>
                    </div>

                    <ul className="space-y-3 text-sm leading-relaxed text-foreground/85 md:text-base">
                      {brand.highlights.map((highlight) => {
                        return (
                          <li key={highlight} className="flex gap-3">
                            <span aria-hidden className="text-primary">
                              —
                            </span>
                            <span>{highlight}</span>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="flex items-start lg:justify-end">
                      <Button asChild variant="outline" className="group rounded-full px-6">
                        <Link href={brand.url} target="_blank" rel="noopener noreferrer">
                          {t("learnMore")}
                          <ExternalLink className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>

                  {index < brands.length - 1 ? (
                    <div className="mt-10 h-px bg-linear-to-r from-transparent via-border to-transparent md:mt-14" />
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-24 md:py-32">
        <div className="absolute inset-0 bg-linear-to-b from-primary/8 via-background/95 to-background" />

        <div className="container relative z-10 mx-auto px-4">
          <div className="mx-auto max-w-4xl space-y-8 text-center">
            <h2 className="font-[family-name:var(--font-outfit)] text-4xl leading-tight md:text-6xl lg:text-7xl">
              {t("cta.titlePart1")} <span className="text-primary">{t("cta.titlePart2")}</span>
            </h2>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-2xl">
              {t("cta.description")}
            </p>
            <Button asChild size="lg" className="group px-8 py-7 text-lg">
              <Link href="/contact">
                {t("cta.button")}
                <ArrowRight className="ml-3 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
