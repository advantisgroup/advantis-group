"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Display, Section } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { WhitepaperCover } from "@/components/whitepaper/WhitepaperCover";
import { Link } from "@/i18n/navigation";

export const HomeWhitepaper = () => {
  const t = useTranslations("whitepaper");

  return (
    <Section>
      <div className="relative overflow-hidden rounded-xxl border border-rule bg-card/40">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(70% 100% at 100% 50%, color-mix(in oklch, var(--primary) 16%, transparent), transparent 60%)",
          }}
        />

        <div className="relative grid items-center gap-10 p-8 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16 md:p-12">
          <div>
            <Display size="md" className="max-w-2xl">
              {t("homeCta.title")}
            </Display>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              {t("homeCta.description")}
            </p>
            <Button asChild size="lg" className="mt-8 rounded-lg">
              <Link href="/whitepaper">
                {t("homeCta.cta")}
                <ArrowRight className="size-4" />
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
    </Section>
  );
};
