import type { ReactNode } from "react";

import { TourFirstVisitNudge, TourReplayButton, type CheckpointId } from "@/components/tour";

export function PageHeader({
  title,
  description,
  eyebrow,
  icon,
  action,
  tourCheckpoint,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  icon?: ReactNode;
  action?: ReactNode;
  /** Renders a replay-tour help button and a first-visit nudge for this tab. */
  tourCheckpoint?: CheckpointId;
}) {
  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                {eyebrow}
              </p>
            )}
            <span className="flex items-center gap-1.5">
              <h1 className="font-display text-2xl font-bold tracking-tight md:text-[1.75rem]">
                {title}
              </h1>
              {tourCheckpoint && <TourReplayButton checkpointId={tourCheckpoint} />}
            </span>
            {description && (
              <p className="mt-1 break-words text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {tourCheckpoint && <TourFirstVisitNudge checkpointId={tourCheckpoint} />}
    </>
  );
}
