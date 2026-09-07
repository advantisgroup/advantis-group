"use client";

import { useEffect, useMemo, useState } from "react";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { MonoLabel } from "./MonoLabel";

const STAGE_KEYS = ["signal", "qualify", "route", "close"] as const;
const STAGE_INTERVAL_MS = 2600;

/**
 * The "how a lead actually moves" diagram.
 *
 * Deliberately drawn as a schematic — bordered nodes, mono labels, connector
 * lines — rather than as a mocked-up dashboard. ADVANTIS sells a service, not
 * a SaaS product, so a fake product screenshot would be claiming something
 * untrue. A schematic can show the mechanism honestly.
 *
 * It carries no numbers for the same reason: every figure on the page has to
 * be one the company can stand behind, and throughput claims are not.
 */
export const PipelineSchematic = ({ className }: { className?: string }) => {
  const t = useTranslations("pipeline");
  const [activeStage, setActiveStage] = useState(0);

  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) return;

    const timer = window.setInterval(() => {
      setActiveStage((current) => (current + 1) % STAGE_KEYS.length);
    }, STAGE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [prefersReducedMotion]);

  const stages = useMemo(
    () =>
      STAGE_KEYS.map((key) => ({
        key,
        code: t(`stages.${key}.code`),
        title: t(`stages.${key}.title`),
        rows: t.raw(`stages.${key}.rows`) as string[],
      })),
    [t],
  );

  return (
    <figure
      className={cn(
        "relative rounded-xl border border-rule bg-card/30 p-4 backdrop-blur-sm md:p-6",
        className,
      )}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-4">
        <MonoLabel marker className="tracking-[0.16em] text-foreground/80 md:tracking-[0.28em]">
          {t("caption")}
        </MonoLabel>
        {/* The stage count is obvious once the cards are in view; on a phone it
            only pushed the caption onto a second line. */}
        <MonoLabel className="hidden text-muted-foreground/70 md:inline-flex">
          {t("legend")}
        </MonoLabel>
      </div>

      {/*
       * Stacked, the four stages ran to ~880px on a phone — over a screenful
       * for one diagram. Below `md` they become a snap rail instead: still
       * read left to right like the drawing they are, but one card tall and
       * swipeable, which is how a sequence wants to work on a touch screen.
       */}
      <div className="scroll-panel -mx-4 flex snap-x snap-mandatory items-stretch overflow-x-auto px-4 pb-3 md:mx-0 md:snap-none md:overflow-visible md:px-0 md:pb-0">
        {stages.map((stage, index) => (
          <div key={stage.key} className="contents">
            {index > 0 ? <Connector active={activeStage === index} /> : null}
            <StageNode
              code={stage.code}
              title={stage.title}
              rows={stage.rows}
              index={index}
              active={activeStage === index}
            />
          </div>
        ))}
      </div>

      <figcaption className="sr-only">{t("altText")}</figcaption>
    </figure>
  );
};

const StageNode = ({
  code,
  title,
  rows,
  index,
  active,
}: {
  code: string;
  title: string;
  rows: string[];
  index: number;
  active: boolean;
}) => (
  <div
    className={cn(
      "relative w-[78vw] shrink-0 snap-start rounded-lg border p-4 transition-colors duration-500 sm:w-[60vw] md:w-auto md:flex-1 md:shrink md:p-5",
      active ? "border-primary/50 bg-primary/[0.06]" : "border-rule/70 bg-transparent",
    )}
  >
    <div className="flex items-center justify-between gap-2">
      <span
        className={cn(
          "font-mono text-[11px] tracking-[0.24em] transition-colors duration-500",
          active ? "text-primary" : "text-muted-foreground/60",
        )}
      >
        {String(index + 1).padStart(2, "0")} / {code}
      </span>
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full transition-colors duration-500",
          active ? "animate-node-pulse bg-primary" : "bg-rule-strong",
        )}
      />
    </div>

    <h3 className="mt-3 font-[family-name:var(--font-outfit)] text-lg font-semibold tracking-[-0.02em] md:text-xl">
      {title}
    </h3>

    <ul className="mt-3 space-y-1.5">
      {rows.map((row) => (
        <li
          key={row}
          className="flex gap-2 font-mono text-[11px] leading-relaxed text-muted-foreground"
        >
          <span aria-hidden className="text-primary/50">
            ·
          </span>
          {row}
        </li>
      ))}
    </ul>
  </div>
);

/**
 * The line between two nodes. Horizontal on desktop, vertical once the
 * diagram stacks — two separate SVGs rather than one rotated element, because
 * a rotated SVG stretches its stroke width along with it.
 */
const Connector = ({ active }: { active: boolean }) => {
  const stroke = active ? "var(--primary)" : "var(--rule-strong)";

  return (
    <div aria-hidden className="flex w-5 shrink-0 items-center justify-center md:w-8">
      <svg className="h-px w-5 md:hidden" viewBox="0 0 20 1" preserveAspectRatio="none">
        <line
          x1="0"
          y1="0.5"
          x2="20"
          y2="0.5"
          stroke={stroke}
          strokeWidth="1"
          strokeDasharray="3 3"
          className="animate-dash-flow"
          style={{ "--dash-duration": "2s" } as React.CSSProperties}
        />
      </svg>
      <svg className="hidden h-px w-8 md:block" viewBox="0 0 32 1" preserveAspectRatio="none">
        <line
          x1="0"
          y1="0.5"
          x2="32"
          y2="0.5"
          stroke={stroke}
          strokeWidth="1"
          strokeDasharray="3 3"
          className="animate-dash-flow"
          style={{ "--dash-duration": "2s" } as React.CSSProperties}
        />
      </svg>
    </div>
  );
};

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(query.matches);

    const onChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return prefersReducedMotion;
}
