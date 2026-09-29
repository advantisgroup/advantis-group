"use client";

import { useTranslations } from "next-intl";

import { AppPreferenceRows } from "@/components/settings/AppPreferencesCard";

import { StepGroup, StepIntro } from "./step-parts";

export function WorkspacePrefsStep() {
  const t = useTranslations("Onboarding");

  return (
    <>
      <StepIntro title={t("workspaceTitle")} hint={t("workspaceHint")} />
      <StepGroup>
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">
          <AppPreferenceRows />
        </div>
      </StepGroup>
    </>
  );
}
