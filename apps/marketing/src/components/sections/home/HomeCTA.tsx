"use client";

import { ArrowRight, Mail } from "lucide-react";
import { useTranslations } from "next-intl";

import { Display } from "@/components/frame";
import { Link } from "@/i18n/navigation";

import { Button } from "../../ui/button";

export const HomeCTA = () => {
  const t = useTranslations("cta");

  // Every locale writes this line as bullet-separated items; split it so the
  // three promises sit in the grid as separate cells rather than as one
  // run-on line of small grey text.
  const benefits = t("benefits")
    .split("•")
    .map((benefit) => benefit.trim())
    .filter(Boolean);

  return (
    <section className="grain relative overflow-hidden border-t border-rule py-16 md:py-36">
      {/* Wash rising from the foot of the page, mirroring the hero's. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 70% at 50% 108%, color-mix(in oklch, var(--primary) 24%, transparent), transparent 70%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-[1440px] px-5 md:px-10">
        <div className="mx-auto max-w-4xl text-center">
          <Display as="h2" size="xl">
            {t("title")} <span className="text-primary">{t("titleHighlight")}</span>
          </Display>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:mt-8 md:text-xl">
            {t("subtitle")}
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row md:mt-10">
            <Button asChild size="lg" className="rounded-lg">
              <Link href="/contact">
                {t("primary")}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-lg border-rule-strong bg-background/40 backdrop-blur-sm"
            >
              <Link href={`mailto:${process.env.NEXT_PUBLIC_EMAIL_ADRESS}`}>
                <Mail className="size-4" />
                {t("secondary")}
              </Link>
            </Button>
          </div>
        </div>

        <ul className="mt-12 grid border-t border-rule sm:grid-cols-3 md:mt-28">
          {benefits.map((benefit) => (
            <li
              key={benefit}
              className="border-b border-rule py-5 text-center sm:border-b-0 sm:border-l sm:px-6 sm:first:border-l-0"
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground/80">
                {benefit}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
