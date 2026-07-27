"use client";

import { motion } from "framer-motion";
import { PartyPopper } from "lucide-react";
import { useTranslations } from "next-intl";

import { TourConfetti } from "@/components/tour/TourConfetti";
import { useTour } from "@/components/tour/TourProvider";
import { Button } from "@/components/ui/button";

import { useOnboarding } from "../OnboardingProvider";

export function FinishStep() {
  const t = useTranslations("Onboarding");
  const { complete } = useOnboarding();
  const { startTour } = useTour();

  function finishWithTour() {
    complete();
    startTour();
  }

  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <TourConfetti />

      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"
      >
        <PartyPopper className="size-8" />
      </motion.div>

      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">{t("finishTitle")}</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {t("finishBody")}
        </p>
      </div>

      <div className="w-full rounded-xl border border-border/70 bg-muted/30 p-4 text-left">
        <p className="text-sm font-medium">{t("tourCta")}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button size="sm" onClick={finishWithTour} className="flex-1">
            {t("tourCtaButton")}
          </Button>
          <Button size="sm" variant="outline" onClick={complete} className="flex-1">
            {t("finish")}
          </Button>
        </div>
      </div>
    </div>
  );
}
