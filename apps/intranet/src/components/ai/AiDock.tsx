"use client";

import { useState } from "react";

import { usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Check, CircleSlash, Info, Unplug, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAiSlotPresent, useRegisterAiSlot } from "@/components/layout/bottom-bars";
import { Button } from "@/components/ui/button";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";

import { AiGlyph } from "./AiGlyph";
import { aiErrorKey } from "./AiRunCard";
import { AiRunDetail } from "./AiRunDetail";
import { AiThinking } from "./AiThinking";
import { useAiEnabled } from "./use-ai-enabled";
import { type AiRunMeta, aiRunState } from "./use-ai-run";

const STATE_ICON = {
  done: { Icon: Check, color: "var(--success)" },
  error: { Icon: AlertTriangle, color: "var(--destructive)" },
  interrupted: { Icon: Unplug, color: "var(--warning)" },
  cancelled: { Icon: CircleSlash, color: "var(--muted-foreground)" },
} as const;

function hrefPath(href: string | null): string | null {
  return href ? href.split(/[?#]/)[0] : null;
}

/** Everything still working or waiting to be looked at — minus whatever
 * belongs to the page you're on, which is already showing it. */
function useDockRuns() {
  const pathname = usePathname();
  const runs = useQuery(api.aiRuns.dock) ?? [];
  const now = useNow(runs.some((r) => r.status === "running"));
  const visible = runs.filter((r) => hrefPath(r.href) !== pathname);
  const working = visible.filter((r) => aiRunState(r, now) === "working").length;
  return { visible, now, working, waiting: visible.length - working };
}

function DockList({
  runs,
  now,
  onNavigate,
  onDetail,
}: {
  runs: AiRunMeta[];
  now: number;
  onNavigate: () => void;
  onDetail: (run: AiRunMeta) => void;
}) {
  const t = useTranslations("Ai");
  const router = useRouter();
  const markSeen = useMutation(api.aiRuns.markSeen);

  return (
    <ul className="space-y-0.5">
      {runs.map((run, index) => {
        const state = aiRunState(run, now);
        const minutes = Math.max(0, Math.round((now - (run.finishedAt ?? now)) / 60_000));
        return (
          <li key={run._id} className="ai-rise" style={{ ["--i" as string]: index }}>
            <div className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent max-md:py-3">
              <button
                type="button"
                onClick={() => {
                  onNavigate();
                  if (run.href) router.push(run.href);
                }}
                disabled={!run.href}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                {state === "working" ? (
                  <span className="ai-edge flex size-7 shrink-0 items-center justify-center rounded-lg [--ai-ground:var(--popover)]">
                    <AiGlyph working className="size-3.5" />
                  </span>
                ) : (
                  (() => {
                    const { Icon, color } = STATE_ICON[state];
                    return (
                      <span
                        className="flex size-7 shrink-0 items-center justify-center rounded-lg"
                        style={{
                          color,
                          background: `color-mix(in oklch, ${color} 14%, transparent)`,
                        }}
                      >
                        <Icon className="size-3.5" strokeWidth={2.5} />
                      </span>
                    );
                  })()
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {t(`kind.${run.kind}`)}
                  </span>
                  {state === "working" ? (
                    <AiThinking
                      className="text-xs [&_svg]:hidden"
                      phase={run.phase}
                      elapsedSec={Math.floor((now - run.startedAt) / 1000)}
                    />
                  ) : (
                    <span className="block truncate text-xs text-muted-foreground">
                      {state === "done"
                        ? t("dockFinishedAgo", { minutes })
                        : state === "error"
                          ? t(aiErrorKey(run.errorCode))
                          : t(`state.${state}`)}
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                aria-label={t("detail.title")}
                onClick={() => onDetail(run)}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-100 transition-opacity hover:bg-background hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
              >
                <Info className="size-3.5" />
              </button>
              {state !== "working" && (
                <button
                  type="button"
                  aria-label={t("dismiss")}
                  onClick={() => void markSeen({ runId: run._id })}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-100 transition-opacity hover:bg-background hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Where AI work goes when you walk away from it, on desktop: a pill in the
 * corner that shows up only when something is working or a result is waiting.
 */
export function AiDock() {
  const t = useTranslations("Ai");
  const { visible, now, working, waiting } = useDockRuns();
  const [open, setOpen] = useState(false);
  const [detailRun, setDetailRun] = useState<AiRunMeta | null>(null);
  const aiEnabled = useAiEnabled();

  if (visible.length === 0 || !aiEnabled) return null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-working={working > 0}
            aria-label={t("dockLabel")}
            className="ai-orbit ai-edge fixed bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] right-6 z-50 hidden h-10 items-center gap-2 rounded-full pl-3 pr-3.5 text-sm font-medium shadow-overlay transition-transform [--ai-ground:var(--popover)] hover:scale-[1.03] print:hidden md:flex"
          >
            <AiGlyph working={working > 0} />
            <span className={cn(working > 0 && "ai-shimmer")}>
              {working > 0
                ? t("dockWorking", { count: working })
                : t("dockReady", { count: waiting })}
            </span>
            {working > 0 && waiting > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-success/15 text-[11px] font-semibold text-success">
                {waiting}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" side="top" className="w-80 p-1.5">
          <p className="px-2.5 pb-1 pt-1.5 text-[0.7rem] font-medium uppercase tracking-[0.16em]">
            <span className="ai-text">{t("dockLabel")}</span>
          </p>
          <DockList
            runs={visible}
            now={now}
            onNavigate={() => setOpen(false)}
            onDetail={(run) => {
              setOpen(false);
              setDetailRun(run);
            }}
          />
        </PopoverContent>
      </Popover>
      <AiRunDetail run={detailRun} onOpenChange={(next) => !next && setDetailRun(null)} />
    </>
  );
}

/**
 * The same dock on a phone: a button and a sheet, living in whatever bar is at
 * the bottom of the screen — the nav pill, a form's action bar, a composer's
 * bar. The `top` copy in the header is only the fallback for full-screen pages
 * with no bottom bar, and hides itself whenever a bottom one is on the page.
 */
export function AiDockButton({
  placement,
  active = true,
  className,
}: {
  placement: "top" | "bottom";
  /** A bottom bar passes `false` while it's off screen (e.g. the keyboard is
   * open), so the header's copy takes over instead of both disappearing. */
  active?: boolean;
  className?: string;
}) {
  const t = useTranslations("Ai");
  const { visible, now, working, waiting } = useDockRuns();
  const [open, setOpen] = useState(false);
  const [detailRun, setDetailRun] = useState<AiRunMeta | null>(null);
  const bottomSlotPresent = useAiSlotPresent();
  const aiEnabled = useAiEnabled();
  useRegisterAiSlot(placement === "bottom" && active && aiEnabled && visible.length > 0);

  if (visible.length === 0 || !aiEnabled) return null;
  if (placement === "bottom" && !active) return null;
  if (placement === "top" && bottomSlotPresent) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("dockLabel")}
        className={cn("relative shrink-0 md:hidden", className)}
        onClick={() => setOpen(true)}
      >
        <AiGlyph working={working > 0} className="size-5" />
        <span
          className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
          style={{
            background:
              working > 0 ? "linear-gradient(135deg, var(--ai-1), var(--ai-3))" : "var(--success)",
          }}
        >
          {visible.length}
        </span>
      </Button>
      <MobileDrawer
        open={open}
        onOpenChange={setOpen}
        ariaLabel={t("dockLabel")}
        className="h-auto max-h-[70dvh] bg-popover text-popover-foreground"
      >
        <div className="shrink-0 px-5 pb-2 pt-1">
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.16em]">
            <span className="ai-text">{t("dockLabel")}</span>
          </p>
          <p className="mt-0.5 font-display text-lg font-bold tracking-tight">
            {working > 0
              ? t("dockWorking", { count: working })
              : t("dockReady", { count: waiting })}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          <DockList
            runs={visible}
            now={now}
            onNavigate={() => setOpen(false)}
            onDetail={(run) => {
              setOpen(false);
              setDetailRun(run);
            }}
          />
        </div>
      </MobileDrawer>
      <AiRunDetail run={detailRun} onOpenChange={(next) => !next && setDetailRun(null)} />
    </>
  );
}
