"use client";

import type { ReactNode } from "react";

import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { TourFirstVisitNudge, type CheckpointId } from "@/components/tour";

/**
 * The header for an app page: its title, icon and description go into the
 * shared top bar (exactly where every other page puts them), and only its
 * controls stay in the page, right-aligned above the content.
 *
 * For a page someone reads rather than operates — a wiki entry, a changelog —
 * use `DocumentHeader` instead, which keeps a real in-page title.
 */
export function PageHeader({
  title,
  description,
  icon,
  action,
  tourCheckpoint,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  /** Renders a replay-tour button in the top bar and a first-visit nudge. */
  tourCheckpoint?: CheckpointId;
}) {
  return (
    <>
      <PageHeaderBar
        title={title}
        description={description}
        icon={icon}
        tourCheckpoint={tourCheckpoint}
        priority={1}
      />
      {action && <div className="mb-5 flex flex-wrap items-center justify-end gap-2">{action}</div>}
      {tourCheckpoint && <TourFirstVisitNudge checkpointId={tourCheckpoint} />}
    </>
  );
}
