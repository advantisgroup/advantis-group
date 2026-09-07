"use client";

import { useEffect, useRef } from "react";

import { motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useTranslations } from "next-intl";

import { Section } from "@/components/frame";
import { Display } from "@/components/frame/Display";

function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  /*
   * Vertical margin only. A bare "-80px" shrinks the observation box on all
   * four sides, and on a 390px-wide phone the left column's number sits at
   * x≈20-80px — outside the horizontally-shrunk root, so it never registered
   * as visible and the counter stayed on 0 while the right column animated.
   */
  const inView = useInView(ref, { once: true, margin: "0px 0px -80px 0px" });
  const value = useMotionValue(0);
  const springValue = useSpring(value, { stiffness: 55, damping: 18, restDelta: 0.001 });
  const displayValue = useTransform(springValue, (current) => Math.round(current).toString());

  useEffect(() => {
    if (inView) value.set(to);
  }, [inView, to, value]);

  return (
    <span ref={ref}>
      <motion.span>{displayValue}</motion.span>
      {suffix}
    </span>
  );
}

/**
 * The bento. Three principles and four figures share one hairline grid at
 * different weights, so the eye gets a route through the section instead of
 * three identical cards in a row.
 *
 * The heading cell is parked in the grid's right half rather than at the top
 * left, so the section's centre of gravity differs from its neighbours. The
 * type inside it still sets flush left — ragged-left headings read as broken.
 *
 * Cells are separated by `gap-px` over a rule-coloured background, which keeps
 * every divider exactly one pixel and perfectly aligned.
 */
export const HomeFeatures = () => {
  const t = useTranslations("features");

  const principles = [
    { id: "01", title: t("feature1.title"), description: t("feature1.description") },
    { id: "02", title: t("feature2.title"), description: t("feature2.description") },
    { id: "03", title: t("feature3.title"), description: t("feature3.description") },
  ];

  const stats = [
    { value: 15, suffix: "+", label: t("stats.experience") },
    { value: 150, suffix: "+", label: t("stats.projects") },
    { value: 4, suffix: "", label: t("stats.brands") },
    { value: 100, suffix: "%", label: t("stats.passion") },
  ];

  return (
    <Section>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-rule lg:grid-cols-4">
        {principles.map((principle, index) => (
          <div
            key={principle.id}
            className={`group col-span-2 bg-background p-6 transition-colors duration-300 hover:bg-card/60 md:p-8 ${
              index === 0 ? "lg:col-span-2" : "lg:col-span-1"
            }`}
          >
            <span className="font-mono text-[11px] tracking-[0.28em] text-primary/70 transition-colors duration-300 group-hover:text-primary">
              {principle.id}
            </span>
            <h3 className="mt-4 font-[family-name:var(--font-outfit)] text-xl font-bold tracking-[-0.02em] md:text-2xl">
              {principle.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
              {principle.description}
            </p>
          </div>
        ))}

        <div className="col-span-2 bg-background p-6 md:p-10 lg:col-span-2 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:flex lg:flex-col lg:justify-between">
          <Display size="lg">
            {t("title")} <span className="whitespace-nowrap">{t("titleBrand")}?</span>
          </Display>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground lg:mt-10">
            {t("subtitle")}
          </p>
        </div>

        {stats.map((stat) => (
          <div key={stat.label} className="col-span-1 bg-background p-5 md:p-8">
            <p className="font-[family-name:var(--font-outfit)] text-4xl font-bold tabular-nums tracking-[-0.03em] text-primary md:text-5xl">
              <CountUp to={stat.value} suffix={stat.suffix} />
            </p>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
};
