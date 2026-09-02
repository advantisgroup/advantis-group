"use client";

import { useTranslations } from "next-intl";

import { Section } from "@/components/frame";

/**
 * The detail behind the hero's positioning line. Set as one large centred
 * statement — the hero already carries the heading, so repeating it here
 * would just be the same sentence twice at two sizes.
 */
export const HomeIntro = () => {
  const t = useTranslations("homeIntro");

  return (
    <Section bordered={false} size="normal">
      <div className="mx-auto max-w-4xl text-center">
        <span aria-hidden className="hatch mx-auto block h-6 w-24 opacity-70" />

        <p className="mt-10 text-xl leading-[1.55] text-foreground/85 md:text-3xl md:leading-[1.45]">
          {t("text")}
        </p>
      </div>
    </Section>
  );
};
