"use client";

import { useState } from "react";

import { usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleSlash,
  Unplug,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { useAiSlotPresent, useRegisterAiSlot } from "@/components/layout/bottom-bars";
import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";

import { AiGlyph } from "./AiGlyph";
import { aiErrorKey } from "./AiRunCard";
import { AiRunDetail } from "./AiRunDetail";
import { AiThinking } from "./AiThinking";
import { useAiRunTitles } from "./transcript";
import { useAiEnabled } from "./use-ai-enabled";
import { type AiRunMeta, aiRunState } from "./use-ai-run";

/** A run that finished this recently keeps the dock on screen even after the
 * page it belongs to has shown it — so it can still be reopened from here. */
const FRESH_MS = 10 * 60_000;
const LIST_MAX = 8;

const STATE_ICON = {
  error: { Icon: AlertTriangle, color: "var(--destructive)" },
  interrupted: { Icon: Unplug, color: "var(--warning)" },
  cancelled: { Icon: CircleSlash, color: "var(--muted-foreground)" },
} as const;

function hrefPath(href: string | null): string | null {
  return href ? href.split(/[?#]/)[0] : null;
}

/**
 * Today's runs that haven't been put away. Working ones and results nobody
 * has looked at yet are what the pill counts — except a result the page
 * you're on is already showing, which isn't waiting for you.
 */
function useDockRuns() {
  const pathname = usePathname();
  const runs = useQuery(api.aiRuns.dock) ?? [];
  const live = runs.some((r) => r.status === "running");
  const now = useNow(runs.length > 0, live ? 1000 : 15_000);
  let working = 0;
  let waiting = 0;
  let fresh = 0;
  for (const run of runs) {
    const state = aiRunState(run, now);
    if (state === "working") working += 1;
    else if (!run.seenAt && hrefPath(run.href) !== pathname) waiting += 1;
    if (run.finishedAt && now - run.finishedAt < FRESH_MS) fresh += 1;
  }
  const show = working + waiting + fresh > 0;
  return { runs: runs.slice(0, LIST_MAX), now, working, waiting, fresh, show };
}

function useAgo() {
  const locale = useLocale();
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  return (ms: number, now: number) => {
    const minutes = Math.round((ms - now) / 60_000);
    return Math.abs(minutes) < 60
      ? format.format(minutes, "minute")
      : format.format(Math.round(minutes / 60), "hour");
  };
}

function DockList({
  runs,
  now,
  onOpen,
  onNavigate,
}: {
  runs: AiRunMeta[];
  now: number;
  /** A row opens the run in the side panel, right where you are. */
  onOpen: (run: AiRunMeta) => void;
  onNavigate: () => void;
}) {
  const t = useTranslations("Ai");
  const router = useRouter();
  const dismiss = useMutation(api.aiRuns.dismiss);
  const titleOf = useAiRunTitles(runs.filter((r) => r.hasTitle).map((r) => r._id));
  const ago = useAgo();

  return (
    <ul className="space-y-0.5">
      {runs.map((run, index) => {
        const state = aiRunState(run, now);
        const title = titleOf(run._id);
        const seen = !!run.seenAt;
        return (
          <li key={run._id} className="ai-rise" style={{ ["--i" as string]: index }}>
            <div className="group flex items-center gap-0.5 rounded-lg pr-1 transition-colors hover:bg-accent">
              <button
                type="button"
                onClick={() => onOpen(run)}
                className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-2.5 text-left max-md:py-3"
              >
                <span className="flex size-5 shrink-0 items-center justify-center">
                  {state === "working" ? (
                    <AiGlyph working />
                  ) : state === "done" ? (
                    <Check
                      className="size-4"
                      strokeWidth={2.25}
                      style={{ color: seen ? "var(--muted-foreground)" : "var(--success)" }}
                    />
                  ) : (
                    (() => {
                      const { Icon, color } = STATE_ICON[state];
                      return <Icon className="size-4" style={{ color }} strokeWidth={2.25} />;
                    })()
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm", !seen && "font-medium")}>
                    {title ?? t(`kind.${run.kind}`)}
                  </span>
                  {state === "working" ? (
                    <AiThinking
                      className="text-xs"
                      phase={run.phase}
                      elapsedSec={Math.floor((now - run.startedAt) / 1000)}
                    />
                  ) : (
                    <span className="block truncate text-xs text-muted-foreground">
                      {title && `${t(`kind.${run.kind}`)} · `}
                      {state === "done"
                        ? t(seen ? "dockDoneAt" : "dockReadyAt", {
                            ago: ago(run.finishedAt ?? now, now),
                          })
                        : state === "error"
                          ? t(aiErrorKey(run.errorCode))
                          : t(`state.${state}`)}
                    </span>
                  )}
                </span>
              </button>
              {run.href && (
                <button
                  type="button"
                  aria-label={t("open")}
                  onClick={() => {
                    onNavigate();
                    router.push(run.href!);
                  }}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-background hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
                >
                  <ArrowUpRight className="size-3.5" />
                </button>
              )}
              {state !== "working" && (
                <button
                  type="button"
                  aria-label={t("dismiss")}
                  onClick={() => void dismiss({ runId: run._id })}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-background hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
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

/** Put-away runs aren't gone — this is the way back to them. */
function SeeAllLink({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations("Ai");
  return (
    <Link
      href="/settings/ai/history"
      onClick={onNavigate}
      className="mt-1 flex items-center justify-between border-t border-border/60 px-2.5 pb-1 pt-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {t("history.seeAllInDock")}
      <ChevronRight className="size-3.5" />
    </Link>
  );
}

function useDockSummary(working: number, waiting: number, fresh: number) {
  const t = useTranslations("Ai");
  return working > 0
    ? t("dockWorking", { count: working })
    : waiting > 0
      ? t("dockReady", { count: waiting })
      : t("dockFinished", { count: fresh });
}

/** Opening a run from the dock is looking at it. */
function useOpenRun() {
  const [detailRun, setDetailRun] = useState<AiRunMeta | null>(null);
  const markSeen = useMutation(api.aiRuns.markSeen);
  return {
    detailRun,
    open: (run: AiRunMeta) => {
      setDetailRun(run);
      if (run.status !== "running" && !run.seenAt) void markSeen({ runId: run._id });
    },
    close: () => setDetailRun(null),
  };
}

/**
 * Where AI work goes when you walk away from it, on desktop: a pill in the
 * corner while something is working, waiting, or has just finished. A row
 * opens the run in the side panel; ↗ goes where it happened; ✕ puts it away.
 */
export function AiDock() {
  const t = useTranslations("Ai");
  const { runs, now, working, waiting, fresh, show } = useDockRuns();
  const summary = useDockSummary(working, waiting, fresh);
  const [open, setOpen] = useState(false);
  const detail = useOpenRun();
  const aiEnabled = useAiEnabled();

  if (!aiEnabled) return null;

  return (
    <>
      {show && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-working={working > 0}
              aria-label={t("dockLabel")}
              className="fixed bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] right-6 z-50 hidden h-10 items-center gap-2 rounded-full border border-border bg-popover pl-3 pr-3.5 text-sm font-medium shadow-overlay transition-colors hover:bg-accent print:hidden md:flex"
            >
              <AiGlyph working={working > 0} />
              <span className={cn(working > 0 && "ai-shimmer")}>{summary}</span>
              {working > 0 && waiting > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-success/15 text-[11px] font-semibold text-success">
                  {waiting}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" side="top" className="w-80 p-1.5">
            <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">
              <span className="ai-text">{t("dockLabel")}</span>
            </p>
            <DockList
              runs={runs}
              now={now}
              onOpen={(run) => {
                setOpen(false);
                detail.open(run);
              }}
              onNavigate={() => setOpen(false)}
            />
            <SeeAllLink onNavigate={() => setOpen(false)} />
          </PopoverContent>
        </Popover>
      )}
      <AiRunDetail run={detail.detailRun} onOpenChange={(next) => !next && detail.close()} />
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
  const { runs, now, working, waiting, fresh, show } = useDockRuns();
  const summary = useDockSummary(working, waiting, fresh);
  const [open, setOpen] = useState(false);
  const detail = useOpenRun();
  const bottomSlotPresent = useAiSlotPresent();
  const aiEnabled = useAiEnabled();
  useRegisterAiSlot(placement === "bottom" && active && aiEnabled && show);

  if (!aiEnabled) return null;
  const visible =
    show && !(placement === "bottom" && !active) && !(placement === "top" && bottomSlotPresent);
  const count = working + waiting;

  return (
    <>
      {visible && (
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("dockLabel")}
            className={cn("relative shrink-0 md:hidden", className)}
            onClick={() => setOpen(true)}
          >
            <AiGlyph working={working > 0} className="size-5" />
            {count > 0 && (
              <span
                className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
                style={{ background: working > 0 ? "var(--ai-1)" : "var(--success)" }}
              >
                {count}
              </span>
            )}
          </Button>
          <MobileDrawer
            open={open}
            onOpenChange={setOpen}
            ariaLabel={t("dockLabel")}
            className="h-auto max-h-[70dvh] bg-popover text-popover-foreground"
          >
            <div className="shrink-0 px-5 pb-2 pt-1">
              <p className="text-xs font-medium text-muted-foreground">
                <span className="ai-text">{t("dockLabel")}</span>
              </p>
              <p className="mt-0.5 text-[15px] font-semibold tracking-tight">{summary}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              <DockList
                runs={runs}
                now={now}
                onOpen={(run) => {
                  setOpen(false);
                  detail.open(run);
                }}
                onNavigate={() => setOpen(false)}
              />
              <SeeAllLink onNavigate={() => setOpen(false)} />
            </div>
          </MobileDrawer>
        </>
      )}
      <AiRunDetail run={detail.detailRun} onOpenChange={(next) => !next && detail.close()} />
    </>
  );
}
