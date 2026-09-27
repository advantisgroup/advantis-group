"use client";

import { useRef } from "react";

import Image from "next/image";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useTranslations } from "next-intl";

import { Reveal } from "@/components/effects/Reveal";
import { Section, SectionHead } from "@/components/frame";

/**
 * Why us: a photograph of the work beside the three principles.
 *
 * Below the hero the page had no pictures at all, so every section after it
 * was type on paper and the whole second half read as one long list. The
 * figures that used to sit under these principles now live with the awards
 * in the proof band, where "here is the evidence" is the whole point.
 */
export const HomeFeatures = () => {
  const t = useTranslations("features");
  const frameRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: frameRef, offset: ["start end", "end start"] });
  const drift = useTransform(scrollYProgress, [0, 1], ["-6%", "6%"]);

  const principles = [
    { title: t("feature1.title"), description: t("feature1.description") },
    { title: t("feature2.title"), description: t("feature2.description") },
    { title: t("feature3.title"), description: t("feature3.description") },
  ];

  return (
    <Section size="loose">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-20">
        {/* The photo drifts a little slower than the page, so it reads as a
            window rather than a sticker. */}
        <div
          ref={frameRef}
          className="relative aspect-[4/3] overflow-hidden rounded-xl lg:aspect-[4/5]"
        >
          <motion.div
            style={reduced ? undefined : { y: drift, scale: 1.12 }}
            className="absolute inset-0"
          >
            <Image
              src="/office/office-whiteboard.png"
              alt={t("imageAlt")}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover object-[35%_center]"
            />
          </motion.div>
        </div>

        <div>
          <Reveal>
            <SectionHead
              align="left"
              title={
                <>
                  {t("title")} <span className="whitespace-nowrap">{t("titleBrand")}?</span>
                </>
              }
              lede={t("subtitle")}
            />
          </Reveal>

          <ol className="mt-10">
            {principles.map((principle, index) => (
              <Reveal
                as="li"
                delay={0.1 + index * 0.1}
                key={principle.title}
                className="grid grid-cols-[2.5rem_minmax(0,1fr)] border-t border-rule py-6 last:border-b"
              >
                <span aria-hidden className="font-display text-lg text-primary">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-lg font-semibold tracking-[-0.01em]">{principle.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">
                    {principle.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </Section>
  );
};
