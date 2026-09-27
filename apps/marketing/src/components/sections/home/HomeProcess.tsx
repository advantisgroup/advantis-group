"use client";

import { useEffect, useRef, useState } from "react";

import { useInView, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";

import { Display, Section } from "@/components/frame";
import { SignalPipeline } from "@/components/illustrations/HomeIllustrations";
import { cn } from "@/lib/utils";

const STAGE_KEYS = ["signal", "qualify", "route", "close"] as const;

/**
 * How a lead moves, as the first change of ground after the hero.
 *
 * The heading and a drawing of the four stages as one conveyor hold still on
 * the left while the stages pass on the right. The one crossing the middle
 * of the screen is the lit one, and so is its station on the conveyor — so the
 * page reads the sequence to you in order instead of laying four equal
 * columns side by side. Red marks only the stage being read.
 *
 * It still carries no figures: every number on this site has to be one the
 * company can stand behind, and throughput claims are not.
 */
export const HomeProcess = () => {
  const t = useTranslations("pipeline");
  const [active, setActive] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  return (
    <Section tone="ink" size="loose">
      <div className="grid gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-[0.8125rem] font-medium text-on-ink/60">{t("caption")}</p>
          <Display size="lg" className="mt-4 max-w-[16ch]">
            {t("title")}
          </Display>
          <p className="mt-6 max-w-md text-base leading-relaxed text-on-ink/70 md:text-lg">
            {t("lede")}
          </p>
          <SignalPipeline active={active} label={t("altText")} className="mt-10 max-w-md" />
        </div>

        <ol className="relative">
          <span aria-hidden className="absolute top-0 bottom-0 left-0 w-px bg-on-ink/15" />

          {STAGE_KEYS.map((key, index) => (
            <Stage
              key={key}
              index={index}
              title={t(`stages.${key}.title`)}
              rows={t.raw(`stages.${key}.rows`) as string[]}
              lit={prefersReducedMotion || active === index}
              onEnter={setActive}
            />
          ))}
        </ol>
      </div>
    </Section>
  );
};

const Stage = ({
  index,
  title,
  rows,
  lit,
  onEnter,
}: {
  index: number;
  title: string;
  rows: string[];
  lit: boolean;
  onEnter: (index: number) => void;
}) => {
  const ref = useRef<HTMLLIElement>(null);
  // A thin band across the middle of the screen: whichever stage is in it is the one being read.
  const inView = useInView(ref, { margin: "-45% 0px -45% 0px" });

  useEffect(() => {
    if (inView) onEnter(index);
  }, [inView, index, onEnter]);

  return (
    <li
      ref={ref}
      // Pointing at a stage lights it too, so the drawing answers the reader, not just the scroll.
      onMouseEnter={() => onEnter(index)}
      className={cn(
        "relative pl-8 pb-16 last:pb-0 transition-opacity duration-500 md:pl-12 md:pb-24",
        // Dimming only where the heading is pinned beside it; stacked on a phone, every stage stays readable.
        !lit && "lg:opacity-35",
      )}
    >
      <span
        aria-hidden
        className="font-display block text-[3.5rem] font-medium leading-none text-on-ink/35 md:text-[4.5rem]"
      >
        {String(index + 1).padStart(2, "0")}
      </span>

      <h3 className="mt-6 text-xl font-semibold md:text-2xl">{title}</h3>

      <ul className="mt-5 max-w-md">
        {rows.map((row) => (
          <li
            key={row}
            className="border-t border-on-ink/15 py-2.5 text-sm text-on-ink/70 last:border-b md:text-base"
          >
            {row}
          </li>
        ))}
      </ul>
    </li>
  );
};
