"use client";

import { useEffect, useState } from "react";

import { Clock3, Coffee, Play } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { useCurrentUser } from "@/components/providers/current-user";
import { useEdenApi } from "@/lib/eden";
import { cn } from "@/lib/utils";

type ClockStatus = "working" | "break" | "clockedOut";

interface ClockodoClockState {
  accountName: string;
  status: ClockStatus;
  since: string | null;
}

function elapsed(since: string | null, now: number): string | null {
  if (!since) return null;
  const milliseconds = now - Date.parse(since);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function ClockodoHeaderControl() {
  const t = useTranslations("Absences");
  const user = useCurrentUser();
  const eden = useEdenApi();
  const [state, setState] = useState<ClockodoClockState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!user.clockodoUserId) return;
    let cancelled = false;
    const refresh = async () => {
      const { data } = await eden.clockodo.clock.me.get();
      if (data && !cancelled) setState(data);
    };
    void refresh();
    const refreshId = window.setInterval(() => void refresh(), 60_000);
    const clockId = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshId);
      window.clearInterval(clockId);
    };
  }, [eden, user.clockodoUserId]);

  if (!user.clockodoUserId || !state) return null;

  const duration = elapsed(state.since, now);
  const active = state.status !== "clockedOut";
  const Icon = state.status === "working" ? Play : state.status === "break" ? Coffee : Clock3;
  const detail =
    state.status === "working"
      ? t("clockStatus.working", { duration: duration ?? "" })
      : state.status === "break"
        ? t("clockStatus.break", { duration: duration ?? "" })
        : t("clockStatus.clockedOut");

  return (
    <Link
      href="/clockodo"
      className="hidden min-w-0 items-center gap-2 rounded-md border border-border/70 bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-accent lg:flex"
      aria-label={t("openClockodo")}
    >
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full",
          state.status === "working"
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : state.status === "break"
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
              : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block max-w-28 truncate text-[11px] font-medium">{state.accountName}</span>
        <span
          className={cn("block text-[10px]", active ? "text-foreground" : "text-muted-foreground")}
        >
          {detail}
        </span>
      </span>
    </Link>
  );
}
