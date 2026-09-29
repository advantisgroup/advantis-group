"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { AnimatePresence, MotionConfig, motion, type Variants } from "framer-motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";

import { useTour } from "@/components/tour/TourProvider";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

import { useOnboarding } from "./OnboardingProvider";
import { AppearanceStep } from "./steps/AppearanceStep";
import { FinishStep } from "./steps/FinishStep";
import { ManagerIntroStep } from "./steps/ManagerIntroStep";
import { NotificationsStep } from "./steps/NotificationsStep";
import { ProfileStep } from "./steps/ProfileStep";
import { ONBOARDING_EASE } from "./steps/step-parts";
import { WelcomeStep } from "./steps/WelcomeStep";
import { WorkspacePrefsStep } from "./steps/WorkspacePrefsStep";

import type { OnboardingStepId } from "./onboarding-types";

const STEP_CONTENT: Record<OnboardingStepId, () => ReactNode> = {
  welcome: () => <WelcomeStep />,
  profile: () => <ProfileStep />,
  appearance: () => <AppearanceStep />,
  workspace: () => <WorkspacePrefsStep />,
  notifications: () => <NotificationsStep />,
  manager: () => <ManagerIntroStep />,
  finish: () => <FinishStep />,
};

const slide: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 28 }),
  center: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.32, ease: ONBOARDING_EASE, staggerChildren: 0.05 },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir * -20,
    transition: { duration: 0.14, ease: "easeIn" },
  }),
};

/**
 * One frame for the whole flow: a bottom sheet on phones, a centred dialog
 * from tablet up. Its size is fixed rather than fitted to each step, so moving
 * between steps only ever changes what's inside — the frame and its buttons
 * never jump. The header and footer stay put; only the middle scrolls.
 */
export function OnboardingPanel() {
  const t = useTranslations("Onboarding");
  const {
    open,
    forced,
    steps,
    stepIndex,
    currentStepId,
    direction,
    back,
    next,
    skip,
    close,
    complete,
  } = useOnboarding();
  const { startTour } = useTour();
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus({ preventScroll: true });
    if (forced) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, forced, close]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [currentStepId]);

  if (!mounted) return null;

  // Welcome and finish bookend the flow; the progress counts what's between.
  const middle = steps.slice(1, -1);
  const isWelcome = currentStepId === "welcome";
  const isFinish = currentStepId === "finish";

  function finishWithTour() {
    complete();
    startTour();
  }

  const panel = (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <div
            key="onboarding"
            className="fixed inset-0 flex items-end justify-center md:items-center md:p-6"
            style={{ zIndex: 60 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={forced ? undefined : close}
              aria-hidden
            />

            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="onboarding-title"
              tabIndex={-1}
              initial={isMobile ? { y: "100%" } : { opacity: 0, y: 16, scale: 0.98 }}
              animate={isMobile ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
              exit={isMobile ? { y: "100%" } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: isMobile ? 0.42 : 0.3, ease: ONBOARDING_EASE }}
              className="relative flex h-[calc(100dvh-env(safe-area-inset-top)-1rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-border/70 bg-card shadow-overlay outline-none md:h-[min(40rem,calc(100dvh-3rem))] md:max-w-xl md:rounded-2xl"
            >
              <div className="flex h-14 shrink-0 items-center gap-4 px-5 md:px-8">
                {!isWelcome && !isFinish ? (
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="shrink-0 text-[12.5px] font-medium tabular-nums text-muted-foreground">
                      {t("stepOfTotal", { step: stepIndex, total: middle.length })}
                    </span>
                    <div className="flex min-w-0 flex-1 gap-1.5" aria-hidden>
                      {middle.map((id, i) => (
                        <span key={id} className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                          <motion.span
                            className="block h-full origin-left rounded-full bg-foreground/80"
                            initial={false}
                            animate={{ scaleX: i + 1 <= stepIndex ? 1 : 0 }}
                            transition={{ duration: 0.45, ease: ONBOARDING_EASE }}
                          />
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1" />
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="-mr-2 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={forced ? t("skipForNow") : t("close")}
                  onClick={forced ? skip : close}
                >
                  <X />
                </Button>
              </div>

              <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={currentStepId}
                    custom={direction}
                    variants={slide}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="flex min-h-full flex-col px-5 pb-8 pt-2 md:px-8"
                  >
                    {STEP_CONTENT[currentStepId]()}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="flex shrink-0 items-center gap-2 border-t border-border/70 px-5 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 md:px-8 md:py-4">
                {isWelcome ? (
                  <Button variant="ghost" onClick={skip}>
                    {t("skipForNow")}
                  </Button>
                ) : isFinish ? (
                  <Button variant="ghost" onClick={complete}>
                    {t("finish")}
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={back}>
                    <ArrowLeft />
                    {t("back")}
                  </Button>
                )}
                <div className="flex-1" />
                <Button
                  className="min-w-32 flex-1 md:flex-none"
                  onClick={isFinish ? finishWithTour : next}
                >
                  {isWelcome ? t("getStarted") : isFinish ? t("tourCtaButton") : t("next")}
                  <ArrowRight />
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );

  return createPortal(panel, document.body);
}
