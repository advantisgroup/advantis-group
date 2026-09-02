"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandText } from "@/components/effects/BrandText";
import { Display, Section } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * Each brand carries its own accent, exposed as a CSS variable on the row so
 * the hover state, the index number, and the left rule all recolour together.
 * The tokens already exist (`--salespirates`, `--rodeo`, …) — previously only
 * the wordmark used them, which wasted the one place the group's four brands
 * could actually feel like four different things.
 */
const BRANDS = [
  {
    name: "Salespirates",
    brand: "salespirates" as const,
    key: "salespirates",
    accent: "var(--salespirates)",
  },
  { name: "Rodeo-Consulting", brand: "rodeo" as const, key: "rodeo", accent: "var(--rodeo)" },
  {
    name: "Oldschool-train",
    brand: "oldschool-train" as const,
    key: "oldschool",
    accent: "var(--oldschool)",
  },
  {
    name: "Sales-AI-Germany",
    brand: "sales-ai-germany" as const,
    key: "salesai",
    accent: "var(--sales-ai)",
  },
];

export const HomeBrands = () => {
  const t = useTranslations("brands");

  return (
    <Section size="loose">
      {/*
       * Indented a column rather than flush left, so this heading sits on a
       * different axis from the ones above and below it.
       */}
      <div className="max-w-4xl lg:ml-[16.666%]">
        <Display size="lg">
          {t("title")} <span className="text-primary">{t("titleHighlight")}</span>
        </Display>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">{t("subtitle")}</p>
      </div>

      <div className="mt-14 border-t border-rule md:mt-20">
        {BRANDS.map((brand, index) => (
          <Link
            key={brand.key}
            href={`/brands#${brand.brand}`}
            className="group relative block border-b border-rule"
            style={{ "--brand-accent": brand.accent } as React.CSSProperties}
          >
            {/* Accent wash, revealed on hover. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100"
              style={{
                background:
                  "linear-gradient(to right, color-mix(in oklch, var(--brand-accent) 12%, transparent), transparent 60%)",
              }}
            />
            {/* Left rule, thickens into the brand colour on hover. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-0.5 origin-top scale-y-0 transition-transform duration-500 group-hover:scale-y-100 group-focus-visible:scale-y-100"
              style={{ background: "var(--brand-accent)" }}
            />

            <div className="relative grid gap-5 py-8 pl-4 pr-1 md:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center md:gap-10 md:py-12 md:pl-8">
              <span className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground/40 transition-colors duration-500 group-hover:text-(--brand-accent) group-focus-visible:text-(--brand-accent)">
                {String(index + 1).padStart(2, "0")}
              </span>

              <div>
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
                  {t(`${brand.key}.tagline`)}
                </span>
                <h3 className="mt-3 font-[family-name:var(--font-outfit)] text-3xl font-bold leading-none tracking-[-0.035em] transition-transform duration-500 group-hover:translate-x-1 md:text-5xl lg:text-6xl">
                  <BrandText brand={brand.brand} hoverable={false}>
                    {brand.name}
                  </BrandText>
                </h3>
              </div>

              <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
                {t(`${brand.key}.description`)}
              </p>

              <span
                aria-hidden
                className="inline-flex size-11 items-center justify-center border border-rule-strong transition-colors duration-500 group-hover:border-(--brand-accent) group-focus-visible:border-(--brand-accent)"
              >
                <ArrowRight className="size-5 transition-transform duration-500 group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-12">
        <Button asChild size="lg" variant="outline" className="rounded-none border-rule-strong">
          <Link href="/brands">
            {t("cta")}
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      </div>
    </Section>
  );
};
