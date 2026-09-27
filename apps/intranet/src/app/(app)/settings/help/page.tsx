"use client";

import { Check, Circle, RotateCcw, RotateCw, SkipForward } from "lucide-react";
import { useTranslations } from "next-intl";

import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import type { CheckpointStatus } from "@/components/tour/tour-types";
import { useTour } from "@/components/tour/TourProvider";
import { Button } from "@/components/ui/button";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";

function CheckpointStatusIcon({ status }: { status: CheckpointStatus }) {
  if (status === "completed") return <Check className="size-3.5 text-ok" />;
  if (status === "skipped") return <SkipForward className="size-3.5 text-muted-foreground" />;
  if (status === "active") return <Circle className="size-3.5 fill-info text-info" />;
  return <Circle className="size-3.5 text-muted-foreground/40" />;
}

export default function SettingsHelpPage() {
  const t = useTranslations("Onboarding");
  const tt = useTranslations("Tour");
  const { restart } = useOnboarding();
  const { state: tourState, visibleCheckpoints, redoCheckpoint, redoTour } = useTour();

  return (
    <>
      <div data-tour="tour-settings-onboarding">
        <SettingsSection title={t("settingsCardTitle")}>
          <SettingsRow
            title={t("restartOnboarding")}
            description={t("restartOnboardingHint")}
            control={
              <Button variant="outline" size="sm" onClick={restart}>
                <RotateCw />
                {t("restartOnboarding")}
              </Button>
            }
          />
        </SettingsSection>
      </div>
      {tourState && (
        <SettingsSection title={tt("chipTitle")} description={tt("settingsHint")}>
          <SettingsRow
            title={tt("restartTour")}
            control={
              <Button variant="outline" size="sm" onClick={redoTour}>
                <RotateCw />
                {tt("restartTour")}
              </Button>
            }
          />
          {visibleCheckpoints.map((cp) => {
            const status: CheckpointStatus = tourState.checkpoints[cp.id]?.status ?? "pending";
            return (
              <SettingsRow
                key={cp.id}
                title={
                  <span className="flex items-center gap-2">
                    <CheckpointStatusIcon status={status} />
                    {tt(`checkpoints.${cp.id}`)}
                  </span>
                }
                control={
                  <Button variant="ghost" size="xs" onClick={() => redoCheckpoint(cp.id)}>
                    <RotateCcw />
                    {tt("redo")}
                  </Button>
                }
              />
            );
          })}
        </SettingsSection>
      )}
    </>
  );
}
