"use client";

import { useTranslations } from "next-intl";

import { useConfirm } from "@/components/ui/dialog";

import { useTour } from "./TourProvider";

export function useTourSkipCheckpoint() {
  const confirm = useConfirm();
  const tt = useTranslations("Tour");
  const { skipCheckpoint, currentCheckpoint } = useTour();

  return async function triggerSkipCheckpoint() {
    if (!currentCheckpoint) return;
    const ok = await confirm({
      title: tt("skipCheckpointTitle", {
        name: tt(`checkpoints.${currentCheckpoint.id}`),
      }),
      description: tt("skipCheckpointBody"),
      confirmLabel: tt("skipConfirm"),
      cancelLabel: tt("keepGoing"),
    });
    if (ok) skipCheckpoint();
  };
}

export function useTourEndTour() {
  const confirm = useConfirm();
  const tt = useTranslations("Tour");
  const { endTour } = useTour();

  return async function triggerEndTour() {
    const ok = await confirm({
      title: tt("endTourTitle"),
      description: tt("endTourBody"),
      confirmLabel: tt("endTour"),
      cancelLabel: tt("keepGoing"),
    });
    if (ok) endTour();
  };
}
