"use client";

import { Check, Circle, RotateCcw, RotateCw, SkipForward } from "lucide-react";
import { useTranslations } from "next-intl";

import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { OnboardingRestartCard } from "@/components/settings/OnboardingRestartCard";
import type { CheckpointStatus } from "@/components/tour/tour-types";
import { useTour } from "@/components/tour/TourProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { useDesignPreview } from "@/lib/design-preview";

function CheckpointStatusIcon({ status }: { status: CheckpointStatus }) {
  if (status === "completed")
    return <Check className="size-3.5 text-green-500 refreshed:text-ok" />;
  if (status === "skipped") return <SkipForward className="size-3.5 text-muted-foreground" />;
  if (status === "active")
    return (
      <Circle className="size-3.5 fill-blue-500 text-blue-500 refreshed:fill-info refreshed:text-info" />
    );
  return <Circle className="size-3.5 text-muted-foreground/40" />;
}

function RefreshedHelp() {
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

function ClassicHelp() {
  const tt = useTranslations("Tour");
  const { state: tourState, visibleCheckpoints, redoCheckpoint, redoTour } = useTour();

  return (
    <>
      <OnboardingRestartCard />
      {tourState && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">{tt("chipTitle")}</p>
              <span className="h-px flex-1 bg-border/60" />
            </div>
            <p className="text-xs text-muted-foreground">{tt("settingsHint")}</p>

            <Button variant="outline" size="sm" className="gap-1.5" onClick={redoTour}>
              <RotateCw className="size-3.5" />
              {tt("restartTour")}
            </Button>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {visibleCheckpoints.map((cp) => {
                const cpState = tourState.checkpoints[cp.id];
                const status: CheckpointStatus = cpState?.status ?? "pending";
                return (
                  <div
                    key={cp.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <CheckpointStatusIcon status={status} />
                      <span className="truncate text-sm">{tt(`checkpoints.${cp.id}`)}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 gap-1 px-2 text-xs"
                      onClick={() => redoCheckpoint(cp.id)}
                    >
                      <RotateCcw className="size-3" />
                      {tt("redo")}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

export default function SettingsHelpPage() {
  return useDesignPreview() === "refreshed" ? <RefreshedHelp /> : <ClassicHelp />;
}
