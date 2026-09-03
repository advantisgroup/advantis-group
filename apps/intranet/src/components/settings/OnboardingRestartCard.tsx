"use client";

import { RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function OnboardingRestartCard() {
  const t = useTranslations("Onboarding");
  const { restart } = useOnboarding();

  return (
    <Card data-tour="tour-settings-onboarding">
      <CardContent className="flex flex-col items-stretch gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold tracking-tight">{t("settingsCardTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("restartOnboardingHint")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 sm:w-auto"
          onClick={restart}
        >
          <RotateCw className="size-3.5" />
          {t("restartOnboarding")}
        </Button>
      </CardContent>
    </Card>
  );
}
