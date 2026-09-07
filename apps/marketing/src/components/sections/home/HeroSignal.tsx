"use client";

import { CheckCircle2, Radio, Route, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const NODES = [
  { key: "signal", icon: Radio, position: "left-1/2 top-0 -translate-x-1/2" },
  { key: "qualify", icon: Sparkles, position: "right-0 top-1/2 -translate-y-1/2" },
  { key: "route", icon: Route, position: "bottom-0 left-1/2 -translate-x-1/2" },
  { key: "close", icon: CheckCircle2, position: "left-0 top-1/2 -translate-y-1/2" },
] as const;

/**
 * The hero's right-hand visual. Not a product screenshot — ADVANTIS sells a
 * service, not software, so there's no dashboard to show (see the same
 * reasoning on `PipelineSchematic`). This is an honest abstraction instead:
 * a pulsing signal at the centre, radiating out to the same four stages the
 * "How it works" section explains in full below. The hero gestures at the
 * mechanism; the section under it is where that gesture gets cashed in.
 */
export const HeroSignal = () => {
  const t = useTranslations("pipeline.stages");

  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm">
      <div className="absolute inset-6 rounded-full border border-rule/60" />

      <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 200 200" fill="none">
        {[
          [100, 100, 100, 28],
          [100, 100, 172, 100],
          [100, 100, 100, 172],
          [100, 100, 28, 100],
        ].map(([x1, y1, x2, y2], index) => (
          <line
            key={index}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="var(--rule-strong)"
            strokeWidth="1"
            strokeDasharray="3 4"
            className="animate-dash-flow"
            style={{ "--dash-duration": "3s" } as React.CSSProperties}
          />
        ))}
      </svg>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {[0, 1].map((ring) => (
          <motion.span
            key={ring}
            aria-hidden
            className="absolute inset-0 rounded-full bg-primary/25"
            animate={{ scale: [1, 2.4], opacity: [0.5, 0] }}
            transition={{
              duration: 2.8,
              repeat: Infinity,
              ease: "easeOut",
              delay: ring * 1.4,
            }}
          />
        ))}
        <div className="relative flex size-14 items-center justify-center rounded-full border border-primary/40 bg-primary/10 backdrop-blur-sm">
          <span className="font-[family-name:var(--font-outfit)] text-lg font-bold text-primary">
            ^
          </span>
        </div>
      </div>

      {NODES.map((node, index) => (
        <motion.div
          key={node.key}
          className={cn("absolute", node.position)}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.4 + index * 0.12, ease: "easeOut" }}
        >
          <div className="flex items-center gap-1.5 rounded-full border border-rule bg-card/90 px-3 py-1.5 shadow-sm backdrop-blur-sm">
            <node.icon className="size-3.5 shrink-0 text-primary" strokeWidth={1.75} />
            <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/80">
              {t(`${node.key}.code`)}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
};
