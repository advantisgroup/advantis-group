"use client";

import { useEffect, useRef } from "react";

import { motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";

import { cn } from "@/lib/utils";

export type StatItem = {
  /** Counts up from zero when the row scrolls into view. */
  value: number;
  /** Rendered immediately after the figure — "+", "%", "x". */
  suffix?: string;
  label: string;
};

/**
 * A figure that counts up once, the first time it is seen.
 *
 * Reduced-motion skips the animation rather than shortening it: a number
 * spinning up is decoration, and the only honest still frame for it is the
 * final value.
 */
const Figure = ({ value, suffix }: { value: number; suffix?: string }) => {
  const ref = useRef<HTMLSpanElement>(null);
  /*
   * Vertical margin only. A bare "-80px" shrinks the observation box on all
   * four sides, and on a 390px-wide phone a left-column figure sits outside
   * the horizontally-shrunk root — so it never registers as visible and the
   * counter stays on zero while its neighbour animates.
   */
  const inView = useInView(ref, { once: true, margin: "0px 0px -80px 0px" });
  const raw = useMotionValue(0);
  const eased = useSpring(raw, { stiffness: 55, damping: 18, restDelta: 0.001 });
  const text = useTransform(eased, (current) => Math.round(current).toString());

  useEffect(() => {
    if (inView) raw.set(value);
  }, [inView, value, raw]);

  return (
    <span ref={ref} className="tabular">
      <motion.span>{text}</motion.span>
      {suffix}
    </span>
  );
};

/**
 * The proof row: figures set large in the serif, each in its own column
 * behind a hairline, with the caption well below rather than tucked under.
 * The gap is the point — it stops the caption reading as a unit of the
 * number and lets the figures carry the row on their own.
 */
export const StatRow = ({
  items,
  className,
}: {
  items: readonly StatItem[];
  className?: string;
}) => (
  <dl className={cn("grid gap-y-10 sm:grid-cols-2 lg:grid-cols-3", className)}>
    {items.map((item) => (
      <div key={item.label} className="border-l border-rule pl-6 md:pl-8">
        <dd className="font-display text-[2.75rem] font-medium leading-none md:text-[3.5rem]">
          <Figure value={item.value} suffix={item.suffix} />
        </dd>
        <dt className="mt-6 max-w-[22ch] text-sm leading-relaxed text-muted-foreground md:mt-8">
          {item.label}
        </dt>
      </div>
    ))}
  </dl>
);

export { Figure };
