"use client";

import { Clock3, Coffee, Play, Square } from "lucide-react";
import { useTranslations } from "next-intl";

import { ClockStartPicker } from "@/components/clockodo/ClockStartPicker";
import { Link } from "@/components/Link";
import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  clockStatusClassName,
  elapsedSince,
  useClockodoActions,
  useClockodoClock,
} from "@/lib/clockodo-clock";
import { cn } from "@/lib/utils";

/** Header status pill — shares its polling/elapsed-time/start-stop logic
 * with the Dashboard's clock card (`@/lib/clockodo-clock`) so the two never
 * drift out of sync, and now lets you start/stop right from here instead
 * of only linking out to /clockodo to do it. */
export function ClockodoHeaderControl() {
  const t = useTranslations("Absences");
  const user = useCurrentUser();
  const { state, now, refresh } = useClockodoClock(!!user.clockodoUserId);
  const actions = useClockodoActions(state, refresh);

  if (!user.clockodoUserId || !state) return null;

  const working = state.status === "working";
  const duration = elapsedSince(state.since, now);
  const Icon = state.status === "working" ? Play : state.status === "break" ? Coffee : Clock3;
  const detail =
    state.status === "working"
      ? t("clockStatus.working", { duration: duration ?? "" })
      : state.status === "break"
        ? t("clockStatus.break", { duration: duration ?? "" })
        : t("clockStatus.clockedOut");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="hidden min-w-0 items-center gap-2 rounded-md border border-border/70 bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-accent lg:flex"
          aria-label={t("openClockodo")}
        >
          <span
            className={cn(
              "relative grid size-6 shrink-0 place-items-center rounded-full",
              clockStatusClassName(state.status),
            )}
          >
            <Icon className="size-3.5" />
            {working && (
              <span className="absolute right-0 top-0 size-1.5 animate-pulse rounded-full bg-emerald-500" />
            )}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block max-w-28 truncate text-[11px] font-medium">
              {state.accountName}
            </span>
            <span
              className={cn(
                "block text-[10px]",
                working ? "text-foreground" : "text-muted-foreground",
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
            <p className="truncate text-sm font-medium">{state.accountName}</p>
            <p className="text-xs text-muted-foreground">{detail}</p>
          </div>
          <Link
            href="/clockodo"
            className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-fg hover:underline"
          >
            {t("openClockodo")}
          </Link>
        </div>
        {working ? (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => void actions.stop()}
            disabled={actions.busy}
          >
            <Square className="size-4" />
            {t("stopClock")}
          </Button>
        ) : actions.pickerOpen ? (
          <ClockStartPicker
            options={actions.options}
            customerId={actions.customerId}
            onCustomerChange={actions.setCustomerId}
            serviceId={actions.serviceId}
            onServiceChange={actions.setServiceId}
            busy={actions.busy}
            onStart={() =>
              void actions.start(Number(actions.customerId), Number(actions.serviceId))
            }
          />
        ) : (
          <Button
            size="sm"
            className="w-full"
            onClick={() => void actions.openStart()}
            disabled={actions.busy}
          >
            <Play className="size-4" />
            {t("startClock")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
