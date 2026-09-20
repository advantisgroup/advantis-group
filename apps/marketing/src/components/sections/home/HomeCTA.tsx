"use client";

import { useTranslations } from "next-intl";

import { Display } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * The page's full stop: the one inverted band on it.
 *
 * It used to be a radial wash rising from the bottom edge under a heading
 * that was the same size as the hero's — two identical opening statements,
 * one at each end of the page. Inverting the band instead ends the page on a
 * change of ground rather than a repeat.
 */
export const HomeCTA = () => {
  const t = useTranslations("cta");

  // Every locale writes this line as bullet-separated items; split it so the
  // three promises sit in a row rather than in one run-on line of grey text.
  const benefits = t("benefits")
    .split("•")
    .map((benefit) => benefit.trim())
    .filter(Boolean);

  return (
    <section className="border-t border-rule bg-foreground text-background">
      <div className="mx-auto w-full max-w-[1200px] px-5 py-20 md:px-10 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <Display as="h2" size="lg">
            {t("title")} {t("titleHighlight")}
          </Display>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-background/70 md:text-lg">
            {t("subtitle")}
          </p>

          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="bg-background text-foreground hover:bg-background/90"
            >
              <Link href="/contact">{t("primary")}</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-background/30 text-background hover:bg-background/10"
            >
              <Link href={`mailto:${process.env.NEXT_PUBLIC_EMAIL_ADRESS}`}>{t("secondary")}</Link>
            </Button>
          </div>
        </div>

        <ul className="mx-auto mt-16 grid max-w-3xl gap-y-3 text-center sm:grid-cols-3 md:mt-24">
          {benefits.map((benefit) => (
            <li key={benefit} className="text-sm text-background/70">
              {benefit}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
