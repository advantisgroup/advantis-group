"use client";

import type { ReactNode } from "react";

import { motion, type Variants } from "framer-motion";

export const ONBOARDING_EASE = [0.16, 1, 0.3, 1] as const;

/** Each block of a step rises in shortly after the one before it — the panel's
 * step container drives the stagger, so steps only have to opt in. */
export const rise: Variants = {
  enter: { opacity: 0, y: 10 },
  center: { opacity: 1, y: 0, transition: { duration: 0.4, ease: ONBOARDING_EASE } },
};

export function StepIntro({ title, hint }: { title: string; hint: string }) {
  return (
    <motion.header variants={rise} className="mb-6">
      <h2
        id="onboarding-title"
        className="font-display text-[22px] font-semibold leading-tight tracking-tight md:text-2xl"
      >
        {title}
      </h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground text-pretty">{hint}</p>
    </motion.header>
  );
}

export function StepGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <motion.section variants={rise} className="space-y-2.5">
      {label && <h3 className="text-[13px] font-medium text-muted-foreground">{label}</h3>}
      {children}
    </motion.section>
  );
}
