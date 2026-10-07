"use client";

import { type ReactNode, useState } from "react";

import { api } from "@advantis/convex/api";
import { type DayWarning } from "@advantis/convex/time";
import { useMutation, useQuery } from "convex/react";
import { CircleDashed, Hourglass, Plane, Sparkles, Thermometer, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorFallback } from "@/components/ErrorFallback";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import {
  type AbsenceStatus,
  type AbsenceType,
  type ClockStatus,
  clientDevice,
  useNow,
  useTimeErrorToast,
} from "@/lib/zeiterfassung";

/** Pieces the Zeiterfassung pages share: colours, badges and the clock hook. */

export const ABSENCE_TYPES: AbsenceType[] = ["vacation", "sick", "special", "overtime", "other"];

export const ABSENCE_STYLE: Record<
  AbsenceType,
  { icon: typeof Plane; className: string; barClassName: string; accent: string }
> = {
  vacation: {
    icon: Plane,
    className: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/15",
    barClassName: "bg-emerald-500",
    accent: "var(--color-emerald-500)",
  },
  sick: {
    icon: Thermometer,
    className: "text-sky-700 dark:text-sky-300 bg-sky-500/15",
    barClassName: "bg-sky-500",
    accent: "var(--color-sky-500)",
  },
  special: {
    icon: Sparkles,
    className: "text-violet-700 dark:text-violet-300 bg-violet-500/15",
    barClassName: "bg-violet-500",
    accent: "var(--color-violet-500)",
  },
  overtime: {
    icon: Hourglass,
    className: "text-rose-700 dark:text-rose-300 bg-rose-500/15",
    barClassName: "bg-rose-500",
    accent: "var(--color-rose-500)",
  },
  other: {
    icon: CircleDashed,
    className: "text-amber-700 dark:text-amber-300 bg-amber-500/15",
    barClassName: "bg-amber-500",
    accent: "var(--color-amber-500)",
  },
};

export const STATUS_ACCENT: Record<AbsenceStatus, string> = {
  pending: "var(--warn)",
  approved: "var(--ok)",
  rejected: "var(--destructive)",
  cancelled: "var(--muted-foreground)",
};

export function AbsenceTypeLabel({ type }: { type: AbsenceType }) {
  const t = useTranslations("Zeiterfassung");
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: ABSENCE_STYLE[type].accent }}
      />
      <span className="truncate">{t(`absenceType.${type}`)}</span>
    </span>
  );
}

export function AbsenceStatusBadge({ status }: { status: AbsenceStatus }) {
  const t = useTranslations("Zeiterfassung");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium",
        status === "cancelled" && "text-muted-foreground",
      )}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: STATUS_ACCENT[status] }}
      />
      {t(`absenceStatus.${status}`)}
    </span>
  );
}

export function AbsenceTypeLegend({ className }: { className?: string }) {
  const t = useTranslations("Zeiterfassung");
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      {ABSENCE_TYPES.map((type) => (
        <span key={type} className="flex items-center gap-1.5">
          <span className={cn("size-2 shrink-0 rounded-full", ABSENCE_STYLE[type].barClassName)} />
          {t(`absenceType.${type}`)}
        </span>
      ))}
    </div>
  );
}

/** Warnings are hints, not errors: small amber chips with the rule behind
 *  them in a tooltip. */
export function WarningChips({ warnings }: { warnings: readonly DayWarning[] }) {
  const t = useTranslations("Zeiterfassung");
  if (warnings.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {warnings.map((warning) => (
        <InfoTip key={warning} text={t(`warnings.${warning}.hint`)}>
          <span className="inline-flex items-center gap-1 rounded-full bg-warn/10 px-2 py-0.5 text-[11px] font-medium text-warn">
            <TriangleAlert className="size-3" />
            {t(`warnings.${warning}.label`)}
          </span>
        </InfoTip>
      ))}
    </span>
  );
}

/** Hours-account figure: plus green, minus red, zero neutral. */
export function balanceClassName(minutes: number): string | undefined {
  if (minutes > 0) return "text-ok";
  if (minutes < 0) return "text-destructive";
  return undefined;
}

export function Chip({
  children,
  tone = "muted",
  hint,
}: {
  children: ReactNode;
  tone?: "muted" | "warn" | "info";
  hint?: string;
}) {
  const chip = (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "warn" && "bg-warn/10 text-warn",
        tone === "info" && "bg-info/10 text-info",
      )}
    >
      {children}
    </span>
  );
  return hint ? <InfoTip text={hint}>{chip}</InfoTip> : chip;
}

export function clockStatusClassName(status: ClockStatus): string {
  switch (status) {
    case "working":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "break":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    case "out":
      return "bg-muted text-muted-foreground";
  }
}

const GRADIENTS: Record<ClockStatus, string> = {
  working: "from-emerald-500/30 via-emerald-500/10 to-transparent",
  break: "from-amber-500/30 via-amber-500/10 to-transparent",
  out: "from-slate-500/20 via-slate-500/5 to-transparent",
};

/** Status-coloured wash behind the clock widgets; cross-fades by opacity
 *  because gradients don't interpolate reliably. Render inside a
 *  `relative overflow-hidden` container with the content on `z-10`. */
export function StatusGradient({ status }: { status: ClockStatus | null }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      {(Object.keys(GRADIENTS) as ClockStatus[]).map((key) => (
        <div
          key={key}
          className={cn(
            "absolute inset-0 bg-gradient-to-tl transition-opacity duration-700 ease-out",
            GRADIENTS[key],
            status === key ? "opacity-100" : "opacity-0",
          )}
        />
      ))}
    </div>
  );
}

/** "3h 12m" since `since`. */
export function elapsed(since: number, now: number): string {
  const total = Math.max(0, Math.floor((now - since) / 60_000));
  const hours = Math.floor(total / 60);
  return hours > 0 ? `${hours}h ${total % 60}m` : `${total % 60}m`;
}

/** The clock and its four actions, shared by the overview card and the
 *  header pill so both always agree. Reactive: no polling. */
export function useTimeClock() {
  const t = useTranslations("Zeiterfassung");
  const state = useQuery(api.time.clock.state);
  const clockIn = useMutation(api.time.clock.clockIn);
  const clockOut = useMutation(api.time.clock.clockOut);
  const startBreak = useMutation(api.time.clock.startBreak);
  const endBreak = useMutation(api.time.clock.endBreak);
  const showError = useTimeErrorToast();
  const now = useNow(15_000);
  const [busy, setBusy] = useState(false);

  const run = (action: () => Promise<unknown>, done: string) => async () => {
    setBusy(true);
    try {
      await action();
      toast.success(done);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const since =
    state?.status === "break"
      ? state.breakStart
      : state?.status === "working"
        ? state.workStart
        : null;
  return {
    state,
    now,
    busy,
    duration: since ? elapsed(since, now) : null,
    clockIn: run(() => clockIn({ device: clientDevice() }), t("clock.toastIn")),
    clockOut: run(() => clockOut({ device: clientDevice() }), t("clock.toastOut")),
    startBreak: run(() => startBreak({ device: clientDevice() }), t("clock.toastBreak")),
    endBreak: run(() => endBreak({ device: clientDevice() }), t("clock.toastResume")),
  };
}

export function SectionBoundary({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={({ reset }) => (
        <ErrorFallback title={title} className="min-h-0 py-6" onRetry={reset} />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

/** Small label used above form fields, matching the Clockodo dialogs. */
export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-muted-foreground">
      {children}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex max-w-full shrink-0 overflow-x-auto rounded-lg border border-border/70 bg-muted/40 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "shrink-0 rounded-md px-3 py-1 text-sm font-medium transition-colors max-md:py-2",
            value === option.value
              ? "bg-card text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
