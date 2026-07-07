"use client";

import { useEffect, useState } from "react";

import { HelpCircle, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useTour } from "./TourProvider";

import type { CheckpointId } from "./tour-types";

export function TourReplayButton({
  checkpointId,
}: {
  checkpointId: CheckpointId;
}) {
  const t = useTranslations("Tour");
  const { visibleCheckpoints, redoCheckpoint, phase } = useTour();

  if (!visibleCheckpoints.some(cp => cp.id === checkpointId)) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            aria-label={t("replayCheckpoint")}
            disabled={phase === "active" || phase === "navigating"}
            onClick={() => redoCheckpoint(checkpointId)}
          >
            <HelpCircle />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("replayCheckpoint")}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function nudgeKey(userId: string, checkpointId: CheckpointId) {
  return `advantis:tour:nudge:v1:${userId}:${checkpointId}`;
}

/**
 * One-time hint on tabs whose tour checkpoint was never visited. Hidden while
 * the tour itself runs, and permanently once dismissed or started (starting
 * flips the checkpoint status away from "pending").
 */
export function TourFirstVisitNudge({
  checkpointId,
}: {
  checkpointId: CheckpointId;
}) {
  const t = useTranslations("Tour");
  const user = useCurrentUser();
  const { state, phase, visibleCheckpoints, redoCheckpoint } = useTour();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      // localStorage is only available post-mount; this is a one-time sync
      // from browser state, not a case of deriving state from props.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(
        localStorage.getItem(nudgeKey(user._id, checkpointId)) !== null
      );
    } catch {
      setDismissed(true);
    }
  }, [user._id, checkpointId]);

  if (dismissed) return null;
  if (!state || state.active || phase === "active" || phase === "navigating")
    return null;
  if (!visibleCheckpoints.some(cp => cp.id === checkpointId)) return null;
  if (state.checkpoints[checkpointId]?.status !== "pending") return null;

  const dismiss = () => {
    try {
      localStorage.setItem(
        nudgeKey(user._id, checkpointId),
        String(Date.now())
      );
    } catch {
      // Storage may be unavailable — the nudge just reappears next visit.
    }
    setDismissed(true);
  };

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5">
      <Sparkles className="size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">
        {t("nudgeBody")}
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          dismiss();
          redoCheckpoint(checkpointId);
        }}
      >
        {t("nudgeStart")}
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={t("nudgeDismiss")}
        onClick={dismiss}
      >
        <X />
      </Button>
    </div>
  );
}
