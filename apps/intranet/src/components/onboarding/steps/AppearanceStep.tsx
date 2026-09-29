"use client";

import { useTranslations } from "next-intl";

import { AppearancePicker, LanguagePicker } from "@/components/settings/PreferencePickers";

import { StepGroup, StepIntro } from "./step-parts";

export function AppearanceStep() {
  const t = useTranslations("Onboarding");
  const ts = useTranslations("Settings");

  return (
    <>
      <StepIntro title={t("appearanceTitle")} hint={t("appearanceHint")} />
      <div className="space-y-8">
        <StepGroup label={ts("appearance")}>
          <AppearancePicker />
        </StepGroup>
        <StepGroup label={ts("language")}>
          <LanguagePicker />
        </StepGroup>
      </div>
    </>
  );
}
