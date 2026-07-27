"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";

import { useOnboarding } from "./OnboardingProvider";
import { DepartmentStep } from "./steps/DepartmentStep";
import { FinishStep } from "./steps/FinishStep";
import { LanguageStep } from "./steps/LanguageStep";
import { ManagerIntroStep } from "./steps/ManagerIntroStep";
import { NotificationsStep } from "./steps/NotificationsStep";
import { ProfileStep } from "./steps/ProfileStep";
import { ThemeStep } from "./steps/ThemeStep";
import { WelcomeStep } from "./steps/WelcomeStep";
import { WorkspacePrefsStep } from "./steps/WorkspacePrefsStep";

import type { OnboardingStepId } from "./onboarding-types";

const STEP_CONTENT: Record<OnboardingStepId, () => ReactNode> = {
  welcome: () => <WelcomeStep />,
  profile: () => <ProfileStep />,
  department: () => <DepartmentStep />,
  notifications: () => <NotificationsStep />,
  theme: () => <ThemeStep />,
  language: () => <LanguageStep />,
  workspace: () => <WorkspacePrefsStep />,
  manager: () => <ManagerIntroStep />,
  finish: () => <FinishStep />,
};

// The bookend steps render their own full custom layout + actions (welcome's
// hero + skip link, finish's confetti + tour CTA) rather than the shared
// Back/Next footer.
const BARE_STEPS = new Set<OnboardingStepId>(["welcome", "finish"]);

export function OnboardingPanel() {
  const t = useTranslations("Onboarding");
  const { open, forced, steps, stepIndex, currentStepId, back, next, close } = useOnboarding();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || forced) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, forced, close]);

  if (!mounted) return null;

  const isBare = BARE_STEPS.has(currentStepId);
  const isFirst = stepIndex === 0;

  const panel = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 60, backdropFilter: "blur(12px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          role="dialog"
          aria-modal="true"
          aria-label={t("triggerLabel")}
        >
          <div
            className="absolute inset-0 bg-black/70"
            onClick={forced ? undefined : close}
            aria-hidden
          />

          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl"
          >
            <motion.div
              layout
              transition={{
                layout: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
              }}
              className="flex flex-1 flex-col overflow-hidden"
            >
              {!isBare && (
                <div className="flex items-center gap-2 px-6 pt-5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("stepOfTotal", {
                      step: stepIndex + 1,
                      total: steps.length,
                    })}
                  </span>
                  <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      animate={{
                        width: `${((stepIndex + 1) / steps.length) * 100}%`,
                      }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                </div>
              )}

              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={currentStepId}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
                >
                  {STEP_CONTENT[currentStepId]()}
                </motion.div>
              </AnimatePresence>

              {!isBare && (
                <div className="flex items-center gap-2 border-t border-border/70 px-6 py-4">
                  {!isFirst && (
                    <Button variant="outline" size="sm" onClick={back}>
                      <ChevronLeft />
                      {t("back")}
                    </Button>
                  )}
                  <div className="flex-1" />
                  <Button size="sm" onClick={next}>
                    {t("next")}
                    <ChevronRight />
                  </Button>
                </div>
              )}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(panel, document.body);
}
