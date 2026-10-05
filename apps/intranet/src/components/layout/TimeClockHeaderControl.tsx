"use client";

import { Clock3, Coffee, Pause, Play, Square } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  clockStatusClassName,
  StatusGradient,
  useTimeClock,
} from "@/components/zeiterfassung/parts";
import { cn } from "@/lib/utils";

/**
 * Header pill for the own time tracking — the Zeiterfassung twin of
 * `ClockodoHeaderControl`. Not mounted in the app shell yet: the cutover
 * swaps it in for the Clockodo one. Until then only the /zeiterfassung
 * overview shows it.
 */
export function TimeClockHeaderControl({ className }: { className?: string }) {
  const t = useTranslations("Zeiterfassung");
  const clock = useTimeClock();
  if (!clock.state) return null;

  const status = clock.state.status;
  const Icon = status === "working" ? Play : status === "break" ? Coffee : Clock3;
  const detail =
    status === "out"
      ? t("clock.status.out")
      : `${t(`clock.status.${status}`)} · ${clock.duration ?? ""}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative flex min-w-0 items-center gap-2 overflow-hidden rounded-md border border-border/70 bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-accent",
            className,
          )}
          aria-label={t("clock.open")}
        >
          <StatusGradient status={status} />
          <span
            className={cn(
              "relative z-10 grid size-6 shrink-0 place-items-center rounded-full",
              clockStatusClassName(status),
            )}
          >
            <Icon className="size-3.5" />
            {status === "working" && (
              <span className="absolute right-0 top-0 size-1.5 animate-pulse rounded-full bg-ok" />
            )}
          </span>
          <span className="relative z-10 min-w-0 leading-tight">
            <span className="block text-[11px] font-medium">{t("title")}</span>
            <span
              className={cn(
                "block text-[10px] tabular-nums",
                status === "working" ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {detail}
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{t("title")}</p>
            <p className="text-xs text-muted-foreground">{detail}</p>
          </div>
          <Link
            href="/zeiterfassung"
            className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-fg hover:underline"
          >
            {t("clock.open")}
          </Link>
        </div>
        {status === "out" ? (
          <Button
            size="sm"
            className="w-full"
            onClick={() => void clock.clockIn()}
            disabled={clock.busy}
          >
            <Play className="size-4" />
            {t("clock.in")}
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {status === "working" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void clock.startBreak()}
                disabled={clock.busy}
              >
                <Pause className="size-4" />
                {t("clock.pause")}
              </Button>
            ) : (
              <Button size="sm" onClick={() => void clock.endBreak()} disabled={clock.busy}>
                <Play className="size-4" />
                {t("clock.resume")}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void clock.clockOut()}
              disabled={clock.busy}
            >
              <Square className="size-4" />
              {t("clock.out")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
