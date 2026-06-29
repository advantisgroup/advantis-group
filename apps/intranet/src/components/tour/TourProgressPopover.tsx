"use client";

import { Check, Circle, RotateCcw, SkipForward } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { useTour } from "./TourProvider";
import type { CheckpointId, CheckpointStatus, TourCheckpoint } from "./tour-types";

function StatusIcon({ status }: { status: CheckpointStatus }) {
  if (status === "completed")
    return <Check className="size-3 text-green-500" />;
  if (status === "skipped")
    return <SkipForward className="size-3 text-muted-foreground" />;
  if (status === "active")
    return <Circle className="size-3 fill-blue-500 text-blue-500" />;
  return <Circle className="size-3 text-muted-foreground/40" />;
}

interface DotProps {
  checkpoint: TourCheckpoint;
  index: number;
  total: number;
}

export function TourProgressPopover({ checkpoint, index, total }: DotProps) {
  const { state, redoCheckpoint, currentCheckpoint } = useTour();
  if (!state) return null;

  const cpState = state.checkpoints[checkpoint.id];
  const status: CheckpointStatus = cpState?.status ?? "pending";
  const isActive = currentCheckpoint?.id === checkpoint.id;

  const pct = index / Math.max(total - 1, 1);

  let dotColor = "bg-muted-foreground/30";
  if (status === "completed") dotColor = "bg-green-500";
  else if (status === "skipped") dotColor = "bg-muted-foreground/50";
  else if (isActive) dotColor = "bg-blue-500";

  const completedAt = cpState?.completedAt;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 size-2.5 rounded-full transition-all ${dotColor} hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
          style={{ left: `${pct * 100}%` }}
          aria-label={`Checkpoint: ${checkpoint.label}`}
        />
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-56">
        <div className="flex items-start gap-2">
          <StatusIcon status={status} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold leading-snug">{checkpoint.label}</p>
            {status === "completed" && completedAt && (
              <p className="text-[10px] text-muted-foreground">
                Completed {new Date(completedAt).toLocaleDateString()}
              </p>
            )}
            {status === "active" && (
              <p className="text-[10px] text-blue-500">In progress</p>
            )}
            {status === "pending" && (
              <p className="text-[10px] text-muted-foreground">Not started</p>
            )}
            {status === "skipped" && (
              <p className="text-[10px] text-muted-foreground">Skipped</p>
            )}
          </div>
        </div>
        {(status === "completed" || status === "skipped") && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-7 w-full justify-start gap-1.5 px-2 text-xs"
            onClick={() => redoCheckpoint(checkpoint.id as CheckpointId)}
          >
            <RotateCcw className="size-3" />
            Redo this checkpoint
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
