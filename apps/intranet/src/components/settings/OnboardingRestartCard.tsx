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
      <CardContent className="flex items-center justify-between gap-3 p-5">
        <div>
          <p className="font-semibold tracking-tight">{t("settingsCardTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("restartOnboardingHint")}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={restart}>
          <RotateCw className="size-3.5" />
          {t("restartOnboarding")}
        </Button>
      </CardContent>
    </Card>
  );
}
