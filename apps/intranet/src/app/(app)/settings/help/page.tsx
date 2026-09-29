"use client";

import { Check, Circle, CircleDot, Play, RotateCcw, RotateCw, SkipForward } from "lucide-react";
import { useTranslations } from "next-intl";

import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import type { CheckpointStatus } from "@/components/tour/tour-types";
import { useTour } from "@/components/tour/TourProvider";
import { Button } from "@/components/ui/button";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { cn } from "@/lib/utils";

const STATUS_ICON: Record<CheckpointStatus, typeof Check> = {
  completed: Check,
  skipped: SkipForward,
  active: CircleDot,
  pending: Circle,
};

export default function SettingsHelpPage() {
  const t = useTranslations("Onboarding");
  const tt = useTranslations("Tour");
  const { restart, isCompleted } = useOnboarding();
  const { state: tourState, visibleCheckpoints, redoCheckpoint, redoTour } = useTour();

  const done = tourState
    ? visibleCheckpoints.filter((cp) => tourState.checkpoints[cp.id]?.status === "completed").length
    : 0;
  const total = visibleCheckpoints.length;

  return (
    <>
      <div data-tour="tour-settings-onboarding">
        <SettingsSection title={t("settingsCardTitle")} description={t("restartOnboardingHint")}>
          <SettingsRow
            title={
              <span className="flex items-center gap-2">
                {isCompleted ? (
                  <Check className="size-4 text-ok" />
                ) : (
                  <Circle className="size-4 text-muted-foreground/50" />
                )}
                {isCompleted ? t("setupDone") : t("setupInProgress")}
              </span>
            }
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
        <SettingsSection
          title={tt("chipTitle")}
          description={tt("settingsHint")}
          action={
            <Button variant="outline" size="sm" onClick={redoTour}>
              <RotateCw />
              {tt("restartTour")}
            </Button>
          }
        >
          <div className="px-4 py-3.5">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium">{tt("progress", { done, total })}</span>
              <span className="tabular-nums text-muted-foreground">
                {total > 0 ? Math.round((done / total) * 100) : 0}%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-ok transition-[width] duration-500"
                style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
              />
            </div>
          </div>
          {visibleCheckpoints.map((cp) => {
            const status: CheckpointStatus = tourState.checkpoints[cp.id]?.status ?? "pending";
            const Icon = STATUS_ICON[status];
            return (
              <div key={cp.id} className="flex items-center gap-3 px-4 py-2.5">
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    status === "completed" && "text-ok",
                    status === "active" && "text-info",
                    (status === "pending" || status === "skipped") && "text-muted-foreground/60",
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                  {tt(`checkpoints.${cp.id}`)}
                </span>
                <span className="hidden text-[12.5px] text-muted-foreground sm:inline">
                  {tt(`status.${status}`)}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  className="shrink-0"
                  onClick={() => redoCheckpoint(cp.id)}
                >
                  {status === "completed" ? <RotateCcw /> : <Play />}
                  {status === "completed" ? tt("redo") : tt("start")}
                </Button>
              </div>
            );
          })}
        </SettingsSection>
      )}
    </>
  );
}
