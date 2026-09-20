"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const STAGE_KEYS = ["signal", "qualify", "route", "close"] as const;

/**
 * How a lead actually moves, drawn as a ruler.
 *
 * One hairline runs the full width and each stage hangs a tick off it, so the
 * four read as positions along a single line rather than as four columns that
 * happen to sit next to each other. The ordinals are at display scale in the
 * serif — they are the thing that says "this is a sequence", so they are
 * allowed to be the largest thing in the band.
 *
 * It was an animated schematic before this: pulsing nodes, dashed connectors
 * travelling between bordered boxes, a stage highlighting itself every 2.6
 * seconds. All of that drew attention to the diagram's chrome rather than to
 * the four words that carry the idea.
 *
 * It still carries no figures: every number on this site has to be one the
 * company can stand behind, and throughput claims are not.
 */
export const ProcessSteps = ({ className }: { className?: string }) => {
  const t = useTranslations("pipeline");

  const stages = STAGE_KEYS.map((key) => ({
    key,
    title: t(`stages.${key}.title`),
    rows: t.raw(`stages.${key}.rows`) as string[],
  }));

  return (
    <figure className={cn("m-0", className)}>
      {/* A real `h2`, not a figcaption: it is the only heading in its section,
          and without one the page jumps from the hero's `h1` to these `h3`s. */}
      <h2 className="text-[0.8125rem] font-medium tracking-normal text-muted-foreground">
        {t("caption")}
      </h2>

      <ol className="mt-10 grid border-t border-rule sm:grid-cols-2 lg:grid-cols-4">
        {stages.map((stage, index) => (
          <li key={stage.key} className="relative pt-9 pr-6 pb-2 sm:pr-10">
            {/* The tick that marks this stage's position on the rule. */}
            <span aria-hidden className="absolute left-0 top-0 h-4 w-px bg-rule-strong" />

            <span
              aria-hidden
              className="font-display block text-[2.75rem] font-medium leading-none text-muted-foreground/45"
            >
              {String(index + 1).padStart(2, "0")}
            </span>

            <h3 className="mt-6 text-lg font-semibold">{stage.title}</h3>

            {/* Hairline rows rather than a bulleted list: the same texture the
                rest of the page uses for "here are the parts of this". */}
            <ul className="mt-4">
              {stage.rows.map((row) => (
                <li
                  key={row}
                  className="border-t border-rule/70 py-2 text-sm text-muted-foreground last:border-b"
                >
                  {row}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </figure>
  );
};
