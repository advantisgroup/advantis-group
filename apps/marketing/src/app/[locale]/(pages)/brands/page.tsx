"use client";

import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandText } from "@/components/effects/BrandText";
import { Display, PageHeader } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { BRANDS } from "@/lib/brands";

export default function UnsereMarken() {
  const t = useTranslations("brandsPage");

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title={
          <>
            {t("hero.titlePrefix")} <span className="text-primary">{t("hero.titleSuffix")}</span>
          </>
        }
        lede={t("hero.subtitle")}
      />

      {/*
       * One band per brand. Each used to carry a gradient wash in its own
       * colour plus a solid coloured bar down its left edge, so scrolling the
       * page moved through four tinted rooms. The wordmark already carries
       * the brand's colour; the room does not need to as well.
       */}
      {BRANDS.map((brand) => (
        <section
          key={brand.key}
          id={brand.brandText}
          className="scroll-mt-24 border-t border-rule py-14 md:py-24"
        >
          <div className="mx-auto w-full max-w-[1200px] px-5 md:px-10">
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-20">
              <div>
                <span className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[0.8125rem] font-medium text-muted-foreground">
                    {t(`items.${brand.key}.tagline`)}
                  </span>
                  {brand.status === "soon" ? (
                    <span className="rounded-full border border-rule px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {t("comingSoon")}
                    </span>
                  ) : null}
                </span>

                <Display as="h2" size="lg" className="mt-3">
                  {brand.status === "live" ? (
                    <BrandText brand={brand.brandText} hoverable={false}>
                      {brand.name}
                    </BrandText>
                  ) : (
                    <span className="text-muted-foreground/70">{brand.name}</span>
                  )}
                </Display>

                {/* No outbound link for a site that isn't up — a dead "learn
                    more" is worse than no button at all. */}
                {brand.status === "live" ? (
                  <Button asChild variant="outline" className="mt-8">
                    <Link href={brand.url} target="_blank" rel="noopener noreferrer">
                      {t("learnMore")}
                      <ArrowUpRight />
                    </Link>
                  </Button>
                ) : null}
              </div>

              <div>
                <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
                  {t(`items.${brand.key}.description`)}
                </p>

                <ul className="mt-8">
                  {[0, 1, 2].map((highlight) => (
                    <li
                      key={highlight}
                      className="border-t border-rule py-3.5 text-sm last:border-b md:text-base"
                    >
                      {t(`items.${brand.key}.highlights.${highlight}`)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      ))}

      <section className="border-t border-rule bg-foreground text-background">
        <div className="mx-auto w-full max-w-[1200px] px-5 py-20 text-center md:px-10 md:py-32">
          <Display as="h2" size="lg" className="mx-auto max-w-[20ch]">
            {t("cta.titlePart1")} {t("cta.titlePart2")}
          </Display>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-background/70 md:text-lg">
            {t("cta.description")}
          </p>
          <Button
            asChild
            size="lg"
            className="mt-9 bg-background text-foreground hover:bg-background/90"
          >
            <Link href="/contact">{t("cta.button")}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
