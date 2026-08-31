"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { motion } from "framer-motion";
import { Check, ChevronRight, Circle, Settings2, SkipForward } from "lucide-react";
import { useTranslations } from "next-intl";

import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import { useTour } from "./TourProvider";

import type { CheckpointStatus } from "./tour-types";

function StatusDot({ status }: { status: CheckpointStatus }) {
  if (status === "completed") return <Check className="size-3.5 shrink-0 text-green-500" />;
  if (status === "skipped")
    return <SkipForward className="size-3.5 shrink-0 text-muted-foreground" />;
  if (status === "active")
    return <Circle className="size-3.5 shrink-0 fill-blue-500 text-blue-500" />;
  return <Circle className="size-3.5 shrink-0 text-muted-foreground/40" />;
}

/**
 * Compact header indicator for tour progress. Collapsed it's just a checkmark;
 * on desktop it expands on hover into a slim progress bar and opens a popover
 * listing the unfinished checkpoints with a shortcut to the detailed view in
 * Settings. On mobile it stays icon-only and opens a bottom drawer instead, so
 * it never eats the cramped header.
 */
export function TourProgressChip() {
  const { state, visibleCheckpoints, currentCheckpoint, redoCheckpoint } = useTour();
  const tt = useTranslations("Tour");
  const router = useRouter();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (!state) return null;

  const total = visibleCheckpoints.length;
  const done = visibleCheckpoints.filter(
    (cp) => state.checkpoints[cp.id]?.status === "completed",
  ).length;

  // Nothing left to nudge about once every checkpoint is done.
  if (total === 0 || done >= total) return null;

  const pct = (done / total) * 100;

  const triggerClass =
    "group flex h-8 items-center gap-2 rounded-full border border-border/70 bg-background/60 px-2 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const ariaLabel = tt("chipAria", { done, total });

  const triggerInner = (
    <>
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Check className="size-3" />
      </span>
      {/* Expands on hover (desktop only) into a short progress bar. */}
      <span className="hidden max-w-0 items-center gap-2 overflow-hidden opacity-0 transition-all duration-300 group-hover:max-w-[160px] group-hover:opacity-100 group-data-[state=open]:max-w-[160px] group-data-[state=open]:opacity-100 md:flex">
        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </span>
        <span className="tabular-nums text-muted-foreground">
          {done}/{total}
        </span>
      </span>
    </>
  );

  const detail = (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{tt("chipTitle")}</p>
          <span className="text-xs tabular-nums text-muted-foreground">
            {done}/{total}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {done === 0 ? tt("chipStart") : tt("chipRemaining", { count: total - done })}
        </p>
      </div>

      <ul className="space-y-0.5">
        {visibleCheckpoints.map((cp) => {
          const status: CheckpointStatus = state.checkpoints[cp.id]?.status ?? "pending";
          const isActive = currentCheckpoint?.id === cp.id;
          return (
            <li key={cp.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  redoCheckpoint(cp.id);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  status === "completed" && "text-muted-foreground",
                  isActive && "font-medium text-foreground",
                )}
              >
                <StatusDot status={status} />
                <span className="flex-1 truncate">{tt(`checkpoints.${cp.id}`)}</span>
                {status !== "completed" && (
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => {
          setOpen(false);
          router.push("/settings/account");
        }}
        className="flex w-full items-center justify-between rounded-md border-t border-border/60 px-2 pb-1 pt-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <Settings2 className="size-3.5" />
          {tt("viewInSettings")}
        </span>
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          className={triggerClass}
          aria-label={ariaLabel}
          onClick={() => setOpen(true)}
        >
          {triggerInner}
        </button>
        <MobileDrawer
          open={open}
          onOpenChange={setOpen}
          ariaLabel="Onboarding tour progress"
          className="h-auto max-h-[80vh]"
        >
          <div className="px-4 pb-4">{detail}</div>
        </MobileDrawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={triggerClass} aria-label={ariaLabel}>
          {triggerInner}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-64">
        {detail}
      </PopoverContent>
    </Popover>
  );
}
