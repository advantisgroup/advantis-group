"use client";

import { useTranslations } from "next-intl";

import { BrandText } from "@/components/effects/BrandText";
import { Reveal, RevealWords } from "@/components/effects/Reveal";
import { Display } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { BRANDS } from "@/lib/brands";

import { HeroMedia } from "./HeroMedia";

/**
 * Statement, ask, photograph, names.
 *
 * Two things were cut. One was a pair of radial gradients bleeding two
 * screenfuls down the page behind everything — a headline on paper is a
 * stronger opening than a headline on a glow. The other was a simulated
 * "live lead flow" card: five invented events for an invented company,
 * animating on a 900ms loop next to the headline. A staged product feed for
 * a company that doesn't sell a product is the least credible thing a
 * homepage can lead with, and the real photograph of the people who do the
 * work says the same thing truthfully.
 */
export const Hero = () => {
  const t = useTranslations("hero");
  const positioning = useTranslations("homeIntro");
  const brandLabel = useTranslations("brands");

  return (
    <section className="pt-28 pb-20 md:pt-36 md:pb-28">
      <div className="mx-auto w-full max-w-[1200px] px-5 md:px-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end lg:gap-16">
          {/*
           * The highlight is coloured directly rather than through BrandText.
           * That component splits on a brand name, and `titleHighlight` is
           * "Sales Power" — no match, so its advantis branch fell back to the
           * literal string "Advantis" and the headline rendered the wrong word.
           */}
          <Display as="h1" size="xl" className="max-w-[15ch] text-pretty">
            <RevealWords text={t("title")} />{" "}
            <RevealWords
              text={t("titleHighlight")}
              delay={t("title").split(" ").length * 0.07}
              className="text-primary"
            />
          </Display>

          <Reveal onLoad delay={0.45} className="lg:pb-2">
            {/* The line that answers "what is this company". */}
            <p className="max-w-xl text-lg leading-[1.55] text-foreground/80">
              {positioning("eyebrow")}
            </p>

            {/*
             * One line on how, not a rundown of every service — the full list
             * has its own section further down, so naming each one here just
             * made the hero the longest thing to read before the reader hit a
             * button, worst of all on mobile where every extra line costs a
             * screen.
             */}
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              {positioning("text")}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/contact">{t("ctaPrimary")}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/brands">{t("ctaSecondary")}</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </div>

      {/* The only image this big on the site — the page's one photograph of
          the actual company. It widens to the screen edges as it scrolls. */}
      <Reveal onLoad delay={0.7} className="mt-14 md:mt-20">
        <HeroMedia src="/office/office-teamwork.png" alt={t("imageAlt")} />
      </Reveal>

      <Reveal onLoad delay={0.9} className="mx-auto w-full max-w-[1200px] px-5 md:px-10">
        {/*
         * Four names, held still. They used to scroll past on an endless
         * marquee, which is a device for hiding that you have more logos than
         * fit — with four, it only made them harder to read.
         *
         * No rule of its own. It used to draw a `border-t` and the section
         * below draws one too, so the row sat in a 50px-tall sandwich between
         * two hairlines and read as a cookie bar. The next section's rule is
         * the only boundary this needs.
         *
         * The names are set in the serif at their own colours rather than as
         * 13px grey text: at the same size and weight as their label they
         * read as five items in a list, not as a label and the four things it
         * names.
         */}
        <div className="mt-14 md:mt-20">
          <p className="text-[0.8125rem] font-medium text-muted-foreground">
            {brandLabel("groupLabel")}
          </p>
          <ul className="mt-5 flex flex-wrap items-baseline gap-x-12 gap-y-4">
            {BRANDS.map((brand) => (
              <li key={brand.key} className="flex items-baseline gap-2">
                <Link
                  href={`/brands#${brand.brandText}`}
                  className="font-display text-xl font-medium transition-opacity hover:opacity-70 md:text-2xl"
                >
                  {/* The unlaunched two are named but not coloured: the accent
                      is what says "this brand is a going concern". */}
                  {brand.status === "live" ? (
                    <BrandText brand={brand.brandText} hoverable={false}>
                      {brand.name}
                    </BrandText>
                  ) : (
                    <span className="text-muted-foreground/70">{brand.name}</span>
                  )}
                </Link>
                {brand.status === "soon" ? (
                  <span className="text-[0.6875rem] font-medium text-muted-foreground/70">
                    {brandLabel("comingSoon")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
};
