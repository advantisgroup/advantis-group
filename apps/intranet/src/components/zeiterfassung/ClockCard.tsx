"use client";

import { Coffee, Pause, Play, Square } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusGradient, useTimeClock } from "@/components/zeiterfassung/parts";
import { type DayView } from "@/components/zeiterfassung/use-days";
import { cn } from "@/lib/utils";
import { formatClock, formatMinutes, useNow } from "@/lib/zeiterfassung";

/** "3:57:12" since `since` — the stopwatch employees know from Clockodo. */
function stopwatch(since: number, now: number): string {
  const total = Math.max(0, Math.floor((now - since) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * The Stempeluhr: one big running clock, one big button. Everything else on
 * the page is secondary to this, like Clockodo's stopwatch screen.
 */
export function ClockCard({ today }: { today: DayView | undefined }) {
  const t = useTranslations("Zeiterfassung");
  const locale = useLocale();
  const clock = useTimeClock();
  const now = useNow(1_000);
  const status = clock.state?.status ?? null;
  const since =
    clock.state?.status === "break"
      ? clock.state.breakStart!
      : clock.state?.status === "working"
        ? clock.state.workStart!
        : null;
  const target = today?.targetMinutes ?? 0;
  const worked = today?.workedMinutes ?? 0;
  const progress = target > 0 ? Math.min(100, (worked / target) * 100) : 0;

  return (
    <Card className="relative overflow-hidden border-border/70 shadow-none">
      <StatusGradient status={status} />
      <CardContent className="relative z-10 flex flex-col items-center gap-6 px-5 py-8 text-center sm:py-10">
        {clock.state === undefined ? (
          <Skeleton className="h-16 w-56" />
        ) : (
          <>
            <div className="space-y-1">
              <p
                className={cn(
                  "inline-flex items-center gap-2 text-sm font-medium",
                  status === "working" && "text-emerald-700 dark:text-emerald-300",
                  status === "break" && "text-amber-700 dark:text-amber-300",
                  status === "out" && "text-muted-foreground",
                )}
              >
                {status === "working" && (
                  <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
                )}
                {status === "break" && <Coffee className="size-3.5" />}
                {t(`clock.status.${clock.state.status}`)}
                {since && (
                  <span className="font-normal text-muted-foreground">
                    · {t("clock.since", { time: formatClock(since, locale) })}
                  </span>
                )}
              </p>
              <p
                className={cn(
                  "font-semibold tabular-nums tracking-tight",
                  "text-5xl sm:text-6xl",
                  status === "out" && "text-muted-foreground/60",
                )}
              >
                {since ? stopwatch(since, now) : "0:00:00"}
              </p>
            </div>

            <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center">
              {status === "out" && (
                <Button
                  size="xl"
                  variant="emerald"
                  className="w-full sm:w-auto sm:min-w-56"
                  onClick={() => void clock.clockIn()}
                  disabled={clock.busy}
                >
                  <Play className="fill-current" />
                  {t("clock.in")}
                </Button>
              )}
              {status === "working" && (
                <>
                  <Button
                    size="xl"
                    variant="outline"
                    className="w-full bg-background/70 sm:w-auto"
                    onClick={() => void clock.startBreak()}
                    disabled={clock.busy}
                  >
                    <Pause className="fill-current" />
                    {t("clock.pause")}
                  </Button>
                  <Button
                    size="xl"
                    className="w-full sm:w-auto sm:min-w-44"
                    onClick={() => void clock.clockOut()}
                    disabled={clock.busy}
                  >
                    <Square className="fill-current" />
                    {t("clock.out")}
                  </Button>
                </>
              )}
              {status === "break" && (
                <>
                  <Button
                    size="xl"
                    variant="emerald"
                    className="w-full sm:w-auto sm:min-w-44"
                    onClick={() => void clock.endBreak()}
                    disabled={clock.busy}
                  >
                    <Play className="fill-current" />
                    {t("clock.resume")}
                  </Button>
                  <Button
                    size="xl"
                    variant="outline"
                    className="w-full bg-background/70 sm:w-auto"
                    onClick={() => void clock.clockOut()}
                    disabled={clock.busy}
                  >
                    <Square className="fill-current" />
                    {t("clock.out")}
                  </Button>
                </>
              )}
            </div>

            {today && (
              <div className="w-full max-w-sm space-y-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">{t("overview.today")}</span>
                  <span className="tabular-nums">
                    <span className="font-semibold">{formatMinutes(worked)}</span>
                    {target > 0 && (
                      <span className="text-muted-foreground"> / {formatMinutes(target)}</span>
                    )}
                  </span>
                </div>
                {target > 0 && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-700",
                        worked >= target ? "bg-emerald-500" : "bg-foreground/70",
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
                {today.holiday && (
                  <p className="text-xs text-muted-foreground">{today.holiday.name}</p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
