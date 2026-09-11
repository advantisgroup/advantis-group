"use client";

import { useState } from "react";

import { usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Check, CircleSlash, Unplug, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";

import { AiGlyph } from "./AiGlyph";
import { aiErrorKey } from "./AiRunCard";
import { AiThinking } from "./AiThinking";
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

/**
 * Where AI work goes when you walk away from it. Shows up only when
 * something is still working or a result is waiting, and never on the page
 * that result belongs to — that page is already showing it.
 */
export function AiDock() {
  const t = useTranslations("Ai");
  const pathname = usePathname();
  const router = useRouter();
  const runs = useQuery(api.aiRuns.dock) ?? [];
  const markSeen = useMutation(api.aiRuns.markSeen);
  const [open, setOpen] = useState(false);
  const now = useNow(runs.some((r) => r.status === "running"));

  const visible = runs.filter((r) => hrefPath(r.href) !== pathname);
  if (visible.length === 0) return null;

  const working = visible.filter((r) => aiRunState(r, now) === "working").length;
  const waiting = visible.length - working;

  function openRun(run: AiRunMeta) {
    setOpen(false);
    if (run.href) router.push(run.href);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-working={working > 0}
          aria-label={t("dockLabel")}
          className="ai-orbit ai-edge fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-4 z-40 flex h-10 items-center gap-2 rounded-full pl-3 pr-3.5 text-sm font-medium shadow-overlay transition-transform [--ai-ground:var(--popover)] hover:scale-[1.03] print:hidden md:bottom-6 md:right-6"
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
        <ul className="space-y-0.5">
          {visible.map((run, index) => {
            const state = aiRunState(run, now);
            const minutes = Math.max(0, Math.round((now - (run.finishedAt ?? now)) / 60_000));
            return (
              <li key={run._id} className="ai-rise" style={{ ["--i" as string]: index }}>
                <div className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent">
                  <button
                    type="button"
                    onClick={() => openRun(run)}
                    disabled={!run.href}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    {state === "working" ? (
                      <span className="ai-edge flex size-7 shrink-0 items-center justify-center rounded-lg [--ai-ground:var(--card)]">
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
      </PopoverContent>
    </Popover>
  );
}
