"use client";

import { useConfirm } from "@/components/ui/dialog";

import { useTour } from "./TourProvider";

export function useTourSkipCheckpoint() {
  const confirm = useConfirm();
  const { skipCheckpoint, currentCheckpoint } = useTour();

  return async function triggerSkipCheckpoint() {
    if (!currentCheckpoint) return;
    const ok = await confirm({
      title: `Skip "${currentCheckpoint.label}"?`,
      description: "You can redo this checkpoint anytime from Settings → Tour.",
      confirmLabel: "Skip",
      cancelLabel: "Keep going",
    });
    if (ok) skipCheckpoint();
  };
}

export function useTourEndTour() {
  const confirm = useConfirm();
  const { endTour } = useTour();

  return async function triggerEndTour() {
    const ok = await confirm({
      title: "End the tour?",
      description: "Your progress is saved. You can restart anytime from Settings → Tour.",
      confirmLabel: "End tour",
      cancelLabel: "Keep going",
    });
    if (ok) endTour();
  };
}
