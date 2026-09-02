"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Display, Marquee } from "@/components/frame";
import { PipelineSchematic } from "@/components/frame/PipelineSchematic";
import { Link } from "@/i18n/navigation";

import { BrandText } from "../../effects/BrandText";
import { Button } from "../../ui/button";

const BRAND_NAMES = [
  "Salespirates",
  "Rodeo-Consulting",
  "Oldschool-train",
  "Sales-AI-Germany",
] as const;

export const Hero = () => {
  const t = useTranslations("hero");
  const specs = t.raw("specs") as { value: string; label: string }[];

  return (
    <section className="relative pt-28 md:pt-36">
      <div className="relative mx-auto w-full max-w-[1440px] px-5 md:px-10">
        {/*
         * Headline left, figures right. The schematic then runs the full
         * container width below both — in a side column its four stages were
         * squeezed to about 140px each and the last one clipped.
         */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] lg:items-end lg:gap-16">
          <div>
            <Display as="h1" size="xl" className="max-w-[15ch] text-pretty">
              {t("title")} <span className="md:hidden">{t("titleHighlight")}</span>
              <span className="hidden md:inline">
                <BrandText brand="advantis" hoverable>
                  {t("titleHighlight")}
                </BrandText>
              </span>
            </Display>

            <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              {t("subtitle")}
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-none">
                <Link href="/contact">
                  {t("ctaPrimary")}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-none border-rule-strong bg-background/40 backdrop-blur-sm"
              >
                <Link href="/brands">{t("ctaSecondary")}</Link>
              </Button>
            </div>
          </div>

          <dl className="border-t border-rule lg:pb-2">
            {specs.map((spec) => (
              <div
                key={spec.label}
                className="flex items-baseline justify-between gap-4 border-b border-rule py-3.5"
              >
                <dt className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground/80">
                  {spec.label}
                </dt>
                <dd className="font-[family-name:var(--font-outfit)] text-2xl font-bold tabular-nums tracking-[-0.03em] md:text-3xl">
                  {spec.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <PipelineSchematic className="mt-16 md:mt-20" />
      </div>

      <Marquee className="mt-16 border-y border-rule py-4 md:mt-24" durationSeconds={45}>
        {BRAND_NAMES.map((name) => (
          <span key={name} className="flex items-center">
            <span className="px-6 font-[family-name:var(--font-outfit)] text-lg font-semibold tracking-[-0.02em] text-muted-foreground/45 md:px-10 md:text-2xl">
              {name}
            </span>
            <span aria-hidden className="size-1 rotate-45 bg-primary/60" />
          </span>
        ))}
      </Marquee>
    </section>
  );
};
