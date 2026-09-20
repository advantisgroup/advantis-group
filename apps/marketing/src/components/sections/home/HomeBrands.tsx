"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandText } from "@/components/effects/BrandText";
import { Display, Section, SectionHead } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { BRANDS } from "@/lib/brands";

/**
 * Four brands, four rows.
 *
 * Each row used to carry a gradient wash in its own colour plus a coloured
 * bar that grew down its left edge on hover. Four accents competing in one
 * section is four accents too many — the wordmark already carries the brand's
 * colour, which is enough to tell them apart.
 */
export const HomeBrands = () => {
  const t = useTranslations("brands");

  return (
    <Section size="loose">
      <SectionHead
        title={
          <>
            {t("title")} <span className="text-primary">{t("titleHighlight")}</span>
          </>
        }
        lede={t("subtitle")}
      />

      <ul className="mt-16">
        {BRANDS.map((brand) => (
          <li key={brand.key}>
            <Link
              href={`/brands#${brand.brandText}`}
              className="group grid gap-3 border-t border-rule py-8 transition-colors hover:bg-accent/40 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-10 md:px-4"
            >
              <div>
                <span className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[13px] text-muted-foreground">
                    {t(`${brand.key}.tagline`)}
                  </span>
                  {/* Named, but plainly not open yet. */}
                  {brand.status === "soon" ? (
                    <span className="rounded-full border border-rule px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {t("comingSoon")}
                    </span>
                  ) : null}
                </span>
                <Display size="md" as="p" className="mt-1.5">
                  {brand.status === "live" ? (
                    <BrandText brand={brand.brandText} hoverable={false}>
                      {brand.name}
                    </BrandText>
                  ) : (
                    <span className="text-muted-foreground/70">{brand.name}</span>
                  )}
                </Display>
              </div>

              <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
                {t(`${brand.key}.description`)}
              </p>

              <span
                aria-hidden
                className="hidden size-10 items-center justify-center rounded-full border border-rule text-muted-foreground transition-colors group-hover:border-rule-strong group-hover:text-foreground md:inline-flex"
              >
                <ArrowRight className="size-4" />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-12 border-t border-rule pt-10">
        <Button asChild variant="outline" size="lg">
          <Link href="/brands">{t("cta")}</Link>
        </Button>
      </div>
    </Section>
  );
};
