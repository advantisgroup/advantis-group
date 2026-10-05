"use client";

import { Clock3, Coffee, Pause, Play, Square } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  clockStatusClassName,
  StatusGradient,
  useTimeClock,
} from "@/components/zeiterfassung/parts";
import { cn } from "@/lib/utils";
import { formatClock } from "@/lib/zeiterfassung";

/** The big clock on the Übersicht: status, running time and the actions. */
export function ClockCard() {
  const t = useTranslations("Zeiterfassung");
  const locale = useLocale();
  const clock = useTimeClock();
  const status = clock.state?.status ?? null;
  const Icon = status === "working" ? Play : status === "break" ? Coffee : Clock3;

  return (
    <Card className="relative overflow-hidden border-border/70 shadow-none">
      <StatusGradient status={status} />
      <CardContent className="relative z-10 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span
            className={cn(
              "relative grid size-12 shrink-0 place-items-center rounded-xl",
              status ? clockStatusClassName(status) : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            {status === "working" && (
              <span className="absolute right-1 top-1 size-2 animate-pulse rounded-full bg-emerald-500" />
            )}
          </span>
          <div className="min-w-0">
            {clock.state === undefined ? (
              <Skeleton className="h-5 w-40" />
            ) : (
              <>
                <p className="text-lg font-semibold leading-tight">
                  {t(`clock.status.${clock.state.status}`)}
                  {clock.duration && (
                    <span className="ml-2 tabular-nums text-muted-foreground">
                      {clock.duration}
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {clock.state.status === "out"
                    ? t("clock.outHint")
                    : t("clock.since", {
                        time: formatClock(
                          clock.state.status === "break"
                            ? clock.state.breakStart!
                            : clock.state.workStart!,
                          locale,
                        ),
                      })}
                </p>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {status === "out" && (
            <Button onClick={() => void clock.clockIn()} disabled={clock.busy}>
              <Play className="size-4" />
              {t("clock.in")}
            </Button>
          )}
          {status === "working" && (
            <>
              <Button
                variant="outline"
                onClick={() => void clock.startBreak()}
                disabled={clock.busy}
              >
                <Pause className="size-4" />
                {t("clock.pause")}
              </Button>
              <Button variant="outline" onClick={() => void clock.clockOut()} disabled={clock.busy}>
                <Square className="size-4" />
                {t("clock.out")}
              </Button>
            </>
          )}
          {status === "break" && (
            <>
              <Button onClick={() => void clock.endBreak()} disabled={clock.busy}>
                <Play className="size-4" />
                {t("clock.resume")}
              </Button>
              <Button variant="outline" onClick={() => void clock.clockOut()} disabled={clock.busy}>
                <Square className="size-4" />
                {t("clock.out")}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
