"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";

import { useOnboarding } from "../OnboardingProvider";

export function WelcomeStep() {
  const t = useTranslations("Onboarding");
  const user = useCurrentUser();
  const { next, skip } = useOnboarding();

  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <motion.div
        initial={{ scale: 0.6, rotate: -10, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"
      >
        <Sparkles className="size-8" />
      </motion.div>

      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">
          {t("welcomeTitle", { name: user.firstName ?? user.name })}
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {t("welcomeBody")}
        </p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button size="lg" className="min-w-40" onClick={next}>
          {t("getStarted")}
        </Button>
        <Button variant="ghost" size="sm" onClick={skip}>
          {t("skipForNow")}
        </Button>
      </div>
    </div>
  );
}
