"use client";

import { useTranslations } from "next-intl";

import { Display, Section } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { WhitepaperCover } from "@/components/whitepaper/WhitepaperCover";
import { Link } from "@/i18n/navigation";

export const HomeWhitepaper = () => {
  const t = useTranslations("whitepaper");

  return (
    <Section tone="raised">
      <div className="grid items-center gap-12 md:grid-cols-[minmax(0,1fr)_auto] md:gap-20">
        <div>
          <Display size="md" className="max-w-[22ch]">
            {t("homeCta.title")}
          </Display>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            {t("homeCta.description")}
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/whitepaper">{t("homeCta.cta")}</Link>
          </Button>
        </div>

        <WhitepaperCover
          title={t("hero.title")}
          size="lg"
          className="h-52 w-36 rotate-2 justify-self-center md:h-72 md:w-52 md:justify-self-end"
        />
      </div>
    </Section>
  );
};
