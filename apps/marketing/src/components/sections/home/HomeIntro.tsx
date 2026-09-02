"use client";

import { useTranslations } from "next-intl";

import { Display, Section } from "@/components/frame";

/**
 * The positioning statement, set centred — the one place on the page the eye
 * comes to rest on the axis rather than at a margin.
 */
export const HomeIntro = () => {
  const t = useTranslations("homeIntro");

  return (
    <Section bordered={false} size="normal">
      <div className="mx-auto max-w-4xl text-center">
        <span aria-hidden className="hatch mx-auto block h-6 w-24 opacity-70" />

        <Display size="md" className="mt-10">
          {t("eyebrow")}
        </Display>

        <p className="mx-auto mt-8 max-w-3xl text-lg leading-[1.75] text-muted-foreground md:text-xl">
          {t("text")}
        </p>
      </div>
    </Section>
  );
};
