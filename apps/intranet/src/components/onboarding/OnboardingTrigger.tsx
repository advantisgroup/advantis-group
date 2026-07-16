"use client";

import { Rocket, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useIsManager } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useOnboarding } from "./OnboardingProvider";

/**
 * Header entry point for the onboarding wizard, shown until it's completed or
 * dismissed. Employees just reopen it (they already had the forced flow and
 * chose to skip or come back later); managers/admins — who never get the
 * forced auto-open — get an explicit dismiss action here too, since the icon
 * is the only place they'll ever see onboarding mentioned.
 */
export function OnboardingTrigger() {
  const t = useTranslations("Onboarding");
  const isManagerOrAdmin = useIsManager();
  const { isCompleted, isDismissed, reopen, dismiss } = useOnboarding();

  if (isCompleted || isDismissed) return null;

  if (isManagerOrAdmin) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            aria-label={t("triggerTooltip")}
          >
            <Rocket />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-sm">
          <DropdownMenuItem onClick={reopen}>
            {t("triggerLabel")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={dismiss}>
            <X />
            {t("dismiss")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

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
