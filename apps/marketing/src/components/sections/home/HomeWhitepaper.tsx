"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { ScrollReveal } from "@/components/effects/ScrollReveal";
import { Button } from "@/components/ui/button";
import { WhitepaperCover } from "@/components/whitepaper/WhitepaperCover";
import { Link } from "@/i18n/navigation";

export const HomeWhitepaper = () => {
  const t = useTranslations("whitepaper");

  return (
    <section className="relative overflow-hidden py-16 md:py-24">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_50%,oklch(0.64_0.2_14_/_0.14),transparent_55%)]" />

      <div className="container relative z-10 mx-auto px-4">
        <ScrollReveal className="mx-auto max-w-7xl">
          <div className="overflow-hidden rounded-[2rem] border border-border/60 bg-card/60">
            <div className="grid items-center gap-10 p-8 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16 md:p-12">
              <div className="space-y-6">
                <p className="font-[family-name:var(--font-outfit)] text-xs uppercase tracking-[0.35em] text-advantis">
                  {t("hero.badge")}
                </p>
                <h2 className="font-[family-name:var(--font-outfit)] max-w-2xl text-3xl leading-[1.1] text-balance md:text-5xl">
                  {t("homeCta.title")}
                </h2>
                <p className="max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                  {t("homeCta.description")}
                </p>
                <Button asChild size="lg" className="group px-8 py-6 text-base">
                  <Link href="/whitepaper">
                    {t("homeCta.cta")}
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
              </div>

              <WhitepaperCover
                title={t("hero.title")}
                size="lg"
                className="h-52 w-36 rotate-2 justify-self-center md:h-72 md:w-52 md:justify-self-end"
              />
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};
