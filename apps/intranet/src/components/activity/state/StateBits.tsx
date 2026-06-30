"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { EmployeeState } from "@/lib/activity/format";
import { useI18n } from "@/lib/activity/i18n";
import { cn } from "@/lib/utils";

/**
 * Shared building blocks for the fused employee state, used on both the Overview
 * cards and the device timeline (the old standalone Live-Status page folded into
 * these). One home for the badge tone map, the per-source signal chips, and the
 * integration-health banner.
 */

/** Badge tone + whether the state should show a live "signal" pulse. */
export const STATE_STYLE: Record<
  EmployeeState,
  {
    variant: "default" | "success" | "warning" | "destructive" | "muted";
    live?: boolean;
  }
> = {
  IN_CALL: { variant: "default", live: true },
  WRAP_UP: { variant: "warning", live: true },
  ACTIVE: { variant: "success", live: true },
  BREAK: { variant: "muted" },
  ABSENT: { variant: "muted" },
  IDLE: { variant: "warning" },
};

/** The fused-state badge (live dot + localised label). */
export function StateBadge({ state }: { state: EmployeeState }) {
  const { t } = useI18n();
  const style = STATE_STYLE[state];
  return (
    <Badge
      variant={style.variant}
      className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider"
    >
      {style.live && <span className="signal-dot !h-1.5 !w-1.5" />}
      {t(`empstate.${state}`)}
    </Badge>
  );
}

/**
 * One source row in the live-state card: the source on the left, its current
 * value on the right as the emphasis. A status dot + colour calls out
 * active/idle/away; unknown sources stay quiet so the eye skips them.
 */
export function Signal({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | null;
  tone?: "ok" | "warn" | "neutral";
}) {
  const known = value != null && value !== "—";
  const dotClass = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : null;
  const valueClass = !known
    ? "text-muted-foreground/50"
    : tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : "text-fg";
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border-soft py-2.5 first:border-t-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="flex items-center gap-2">
        {known && dotClass && (
          <span className={cn("h-2 w-2 rounded-full", dotClass)} />
        )}
        <span className={cn("text-sm font-bold tabular-nums", valueClass)}>
          {value ?? "—"}
        </span>
      </span>
    </div>
  );
}

/** Per-source signals (workstation / Genesys / Clockodo) for one employee. */
export function SourceSignals({
  deviceIdle,
  genesysRoutingStatus,
  genesysPresence,
  clockodoWorking,
  clockodoBreak,
  clockodoAbsent,
}: {
  deviceIdle: boolean | null;
  genesysRoutingStatus: string | null;
  genesysPresence: string | null;
  clockodoWorking: boolean | null;
  clockodoBreak: boolean | null;
  clockodoAbsent: boolean | null;
}) {
  const { t } = useI18n();
  const genesys = genesysRoutingStatus ?? genesysPresence;
  const genesysTone: "ok" | "warn" | "neutral" =
    genesys === "INTERACTING" || genesys === "AVAILABLE"
      ? "ok"
      : genesys === "NOT_RESPONDING" ||
          genesys === "BUSY" ||
          genesys === "AWAY" ||
          genesys === "OFFLINE"
        ? "warn"
        : "neutral";
  return (
    <div>
      <Signal
        label={t("state.source.agent")}
        tone={deviceIdle == null ? "neutral" : deviceIdle ? "warn" : "ok"}
        value={
          deviceIdle == null
            ? null
            : deviceIdle
              ? t("common.idle")
              : t("common.active")
        }
      />
      <Signal
        label={t("state.source.genesys")}
        tone={genesysTone}
        value={genesys}
      />
      <Signal
        label={t("state.source.clockodo")}
        tone={
          clockodoAbsent || clockodoBreak
            ? "warn"
            : clockodoWorking
              ? "ok"
              : "neutral"
        }
        value={
          clockodoAbsent
            ? t("empstate.ABSENT")
            : clockodoBreak
              ? t("empstate.BREAK")
              : clockodoWorking == null
                ? null
                : clockodoWorking
                  ? t("common.active")
                  : "—"
        }
      />
    </div>
  );
}

/**
 * Per-source availability banner. A down/unconfigured integration shows here
 * with its reason; it never blocks the rest — the fused state simply stops using
 * that signal. Renders nothing when every source is healthy.
 */
export function HealthBanner() {
  const { t } = useI18n();
  const health = useQuery(api.activity.state.health);
  const degraded = (health ?? []).filter(h => h.status !== "ok");
  if (degraded.length === 0) return null;

  return (
    <div className="space-y-2">
      {degraded.map(h => {
        const source = t(`state.source.${h.source}`);
        const text =
          h.status === "unconfigured"
            ? t("state.health.unconfigured", { source })
            : t("state.health.unavailable", {
                source,
                reason: h.message ?? "—",
              });
        return (
          <div
            key={h.source}
            className="flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <div className="min-w-0">
              <p className="text-sm text-fg">{text}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("state.health.degraded")}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
