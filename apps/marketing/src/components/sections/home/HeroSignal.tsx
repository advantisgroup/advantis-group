"use client";

import { useEffect, useState } from "react";

import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, PhoneCall, Radio, Route, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const EVENTS = [
  { key: "enquiry", icon: Radio, time: "09:41" },
  { key: "qualified", icon: Sparkles, time: "09:41" },
  { key: "routed", icon: Route, time: "09:42" },
  { key: "call", icon: PhoneCall, time: "09:44" },
  { key: "closed", icon: CheckCircle2, time: "09:58" },
] as const;

const STEP_MS = 900;

/**
 * The hero's right-hand visual: one lead walking the same four stages the
 * "How it works" schematic explains below, but concrete — a name, a time, a
 * colleague it got routed to.
 *
 * Deliberately *not* dressed as a product screenshot (no window chrome, no
 * sidebar). ADVANTIS sells a service, not software, so a fake dashboard would
 * be claiming something untrue — same reasoning as `PipelineSchematic`. This
 * is a diagram with texture: the company name is an obvious placeholder and
 * Andrea R. is on the team page doing exactly this job.
 */
export const HeroSignal = () => {
  const t = useTranslations("hero.signal");
  const prefersReducedMotion = useReducedMotion();

  // One extra beat past the last event so the finished list holds for a
  // moment before the loop restarts.
  const [step, setStep] = useState(prefersReducedMotion ? EVENTS.length : 0);

  useEffect(() => {
    if (prefersReducedMotion) {
      setStep(EVENTS.length);
      return;
    }

    const id = window.setInterval(() => {
      setStep((current) => (current + 1) % (EVENTS.length + 2));
    }, STEP_MS);

    return () => window.clearInterval(id);
  }, [prefersReducedMotion]);

  const shown = Math.min(step, EVENTS.length);
  const activeIndex = shown - 1;
  const progress = shown / EVENTS.length;

  return (
    /*
     * Hidden from assistive tech: the rows are an illustration, not a feed.
     * Read aloud without the visual framing that marks them as an example,
     * "Inbound enquiry · Musterfirma GmbH · 09:41" sounds like a fact. Same
     * call `PipelineSchematic` makes for its mirror panel.
     */
    <div aria-hidden className="relative overflow-hidden rounded-2xl p-px">
      {/* Travelling border highlight — the card's only continuous motion. */}
      {prefersReducedMotion ? null : (
        <motion.div
          aria-hidden
          className="absolute inset-[-120%]"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg 260deg, color-mix(in oklch, var(--primary) 70%, transparent) 320deg, transparent 360deg)",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
        />
      )}

      {/* Opaque on purpose: a translucent panel lets the rotating highlight
          bleed through the middle instead of only showing at the edge. */}
      <div className="relative flex h-[27rem] flex-col rounded-2xl border border-rule bg-card">
        <div className="flex items-center justify-between border-b border-rule px-5 py-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            {t("label")}
          </span>
          {/* Neutral chrome, one small live dot — a red-tinted pill up here
              competes with the actual CTA a few hundred pixels to the left. */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-background/60 px-2.5 py-1">
            <span className="relative flex size-1.5">
              {prefersReducedMotion ? null : (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
              )}
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {t("live")}
            </span>
          </span>
        </div>

        <ul className="flex flex-1 flex-col justify-center gap-1 px-3 py-3">
          {EVENTS.map((event, index) => {
            const visible = index < shown;
            const isActive = index === activeIndex;

            return (
              <motion.li
                key={event.key}
                initial={false}
                animate={{
                  opacity: visible ? 1 : 0,
                  y: visible ? 0 : 8,
                }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-500",
                  isActive ? "bg-primary/[0.07]" : "bg-transparent",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-500",
                    isActive
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-rule bg-background/60 text-muted-foreground",
                  )}
                >
                  <event.icon className="size-3.5" strokeWidth={1.75} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {t(`events.${event.key}.title`)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t(`events.${event.key}.detail`)}
                  </span>
                </span>

                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {event.time}
                </span>
              </motion.li>
            );
          })}
        </ul>

        <div className="border-t border-rule px-5 py-4">
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
            <span>{t("from")}</span>
            <span>{t("to")}</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-rule">
            <motion.div
              className="h-full rounded-full bg-primary"
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
