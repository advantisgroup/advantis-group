"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, LifeBuoy, ShieldCheck, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAiEnabled } from "@/components/ai/use-ai-enabled";
import { Link } from "@/components/Link";
import { TourConfetti } from "@/components/tour/TourConfetti";

import { useOnboarding } from "../OnboardingProvider";
import { ONBOARDING_EASE, rise } from "./step-parts";

export function FinishStep() {
  const t = useTranslations("Onboarding");
  const { complete } = useOnboarding();
  const aiEnabled = useAiEnabled();
  const reduceMotion = useReducedMotion();

  // Things that live in Settings but are worth knowing about on day one.
  const later = [
    { key: "security", href: "/settings/account", icon: ShieldCheck },
    ...(aiEnabled ? [{ key: "ai", href: "/settings/ai", icon: Sparkles }] : []),
    { key: "help", href: "/help", icon: LifeBuoy },
  ];

  return (
    <div className="my-auto flex flex-col items-center py-4 text-center">
      {!reduceMotion && <TourConfetti />}

      <motion.div variants={rise}>
        <svg viewBox="0 0 48 48" className="size-12 text-ok" aria-hidden>
          <motion.circle
            cx="24"
            cy="24"
            r="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, ease: ONBOARDING_EASE }}
          />
          <motion.path
            d="M15 24.5l6 6 12-13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.45, ease: ONBOARDING_EASE }}
          />
        </svg>
      </motion.div>

      <motion.h2
        variants={rise}
        id="onboarding-title"
        className="mt-6 font-display text-[26px] font-semibold leading-tight tracking-tight md:text-3xl"
      >
        {t("finishTitle")}
      </motion.h2>
      <motion.p
        variants={rise}
        className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground text-pretty"
      >
        {t("finishBody")}
      </motion.p>

      <motion.div variants={rise} className="mt-8 w-full max-w-sm text-left">
        <p className="mb-2.5 text-[13px] font-medium text-muted-foreground">{t("laterTitle")}</p>
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">
          {later.map(({ key, href, icon: Icon }) => (
            <li key={key}>
              <Link
                href={href}
                onClick={complete}
                className="flex items-center gap-3 px-4 py-3 text-[14px] transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">{t(`later_${key}`)}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}
