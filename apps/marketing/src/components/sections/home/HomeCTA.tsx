"use client";

import { useUser } from "@clerk/nextjs";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { Reveal } from "@/components/effects/Reveal";
import { Display } from "@/components/frame";
import { NextLevel } from "@/components/illustrations/HomeIllustrations";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * The page's full stop: the ask on the inverted ground, beside a block
 * climbing to the floor above — "the next level", drawn.
 *
 * It used to be a radial wash rising from the bottom edge under a heading
 * that was the same size as the hero's — two identical opening statements,
 * one at each end of the page. Inverting the band instead ends the page on a
 * change of ground rather than a repeat.
 */
export const HomeCTA = () => {
  const t = useTranslations("cta");
  const { isSignedIn } = useUser();

  // Every locale writes this line as bullet-separated items; split it so the
  // three promises read as a checklist rather than one run-on line of grey text.
  const benefits = t("benefits")
    .split("•")
    .map((benefit) => benefit.trim())
    .filter(Boolean);

  return (
    <section data-header-inverse className="border-t border-rule bg-ink text-on-ink">
      <div className="mx-auto grid w-full max-w-[1200px] gap-14 px-5 py-20 md:px-10 md:py-32 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-20">
        <Reveal>
          <Display as="h2" size="lg" className="max-w-[16ch]">
            {t("title")} <span className="text-primary">{t("titleHighlight")}</span>
          </Display>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-on-ink/70 md:text-lg">
            {t("subtitle")}
          </p>

          <ul className="mt-8 max-w-md">
            {benefits.map((benefit) => (
              <li
                key={benefit}
                className="flex items-center gap-3 border-t border-on-ink/15 py-3 text-sm text-on-ink/80 last:border-b"
              >
                <Check className="size-4 text-primary" aria-hidden />
                {benefit}
              </li>
            ))}
          </ul>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-on-ink text-ink hover:bg-on-ink/90">
              <Link href="/contact">{t("primary")}</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-on-ink/30 text-on-ink hover:bg-on-ink/10"
            >
              <Link href={`mailto:${process.env.NEXT_PUBLIC_EMAIL_ADRESS}`}>{t("secondary")}</Link>
            </Button>
          </div>

          {/* someone who has written before is more likely looking for the answer than a new form */}
          {isSignedIn ? (
            <p className="mt-6 text-sm text-on-ink/70">
              {t.rich("returning", {
                link: (chunks) => (
                  <Link
                    href="/account/submissions"
                    className="text-on-ink underline underline-offset-4 hover:no-underline"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          ) : null}
        </Reveal>

        <Reveal delay={0.15}>
          <NextLevel />
        </Reveal>
      </div>
    </section>
  );
};
