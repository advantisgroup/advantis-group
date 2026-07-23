"use client";

import { Rocket } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useOnboarding } from "./OnboardingProvider";

/**
 * Header entry point for the onboarding wizard, shown until it's completed.
 * Skipping/dismissing the modal only stops it from forcing itself open again
 * — this icon stays in the header as a standing reminder for both employees
 * and managers/admins until onboarding is actually completed.
 */
export function OnboardingTrigger() {
  const t = useTranslations("Onboarding");
  const { isCompleted, reopen } = useOnboarding();

  if (isCompleted) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            aria-label={t("triggerTooltip")}
            onClick={reopen}
          >
            <Rocket />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("triggerTooltip")}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
