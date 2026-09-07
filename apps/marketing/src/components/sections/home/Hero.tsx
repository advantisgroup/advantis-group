"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Display, Marquee } from "@/components/frame";
import { PipelineSchematic } from "@/components/frame/PipelineSchematic";
import { Link } from "@/i18n/navigation";
import { BRANDS } from "@/lib/brands";

import { Button } from "../../ui/button";

/**
 * One column, one reading order: what the company is called, what it actually
 * does, the pitch, the ask, then the diagram of how the work runs.
 *
 * The figures that used to sit opposite the headline are gone — 15+ / 150+ / 4
 * are already the "why us" grid further down and GDPR is already in the proof
 * bar, so the hero was competing with itself for attention while repeating
 * numbers the reader would meet again in a minute.
 */
export const Hero = () => {
  const t = useTranslations("hero");
  const positioning = useTranslations("homeIntro");

  return (
    <section className="relative pt-24 md:pt-36">
      <div className="relative mx-auto w-full max-w-[1440px] px-5 md:px-10">
        <div className="max-w-4xl">
          {/*
           * The highlight is coloured directly rather than through BrandText.
           * That component splits on a brand name, and `titleHighlight` is
           * "Sales Power" — no match, so its advantis branch fell back to the
           * literal string "Advantis" and the headline rendered the wrong
           * word. Mobile dodged it only by rendering an unstyled copy.
           */}
          <Display as="h1" size="xl" className="max-w-[15ch] text-pretty">
            {t("title")} <span className="text-primary">{t("titleHighlight")}</span>
          </Display>

          {/* The line that answers "what is this company". */}
          <p className="mt-6 max-w-2xl text-lg leading-[1.4] text-foreground/85 md:mt-8 md:text-2xl md:leading-[1.5]">
            {positioning("eyebrow")}
          </p>

          {/*
           * One line on how, not a rundown of every service — the full list
           * already has its own section (HomeServices) further down the
           * page, so naming each one here just made the hero the longest
           * thing to read before the reader hit a button, worst of all on
           * mobile where every extra line costs a screen.
           */}
          <p className="mt-4 max-w-xl text-base leading-[1.5] text-muted-foreground md:mt-5 md:text-lg md:leading-[1.6]">
            {positioning("text")}
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-lg">
              <Link href="/contact">
                {t("ctaPrimary")}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-lg border-rule-strong bg-background/40 backdrop-blur-sm"
            >
              <Link href="/brands">{t("ctaSecondary")}</Link>
            </Button>
          </div>
        </div>

        <PipelineSchematic className="mt-12 md:mt-24" />
      </div>

      <Marquee className="mt-12 border-y border-rule py-4 md:mt-24" durationSeconds={45}>
        {BRANDS.map((brand) => (
          <span key={brand.key} className="flex items-center">
            <span className="px-6 font-[family-name:var(--font-outfit)] text-lg font-semibold tracking-[-0.02em] text-muted-foreground/45 md:px-10 md:text-2xl">
              {brand.name}
            </span>
            <span aria-hidden className="size-1 rotate-45 bg-primary/60" />
          </span>
        ))}
      </Marquee>
    </section>
  );
};
