"use client";

import { Check, CheckCheck, CircleDashed, Minus, PenLine } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export interface ReadinessCheck {
  key: string;
  label: string;
  done: boolean;
  /** Nice to have — never blocks submitting. */
  optional?: boolean;
  /** Takes the person to the field, e.g. focus it or open the options sheet. */
  onFix?: () => void;
}

export type ReadinessTier = "empty" | "missing" | "ready" | "complete";

export interface Readiness {
  tier: ReadinessTier;
  missing: ReadinessCheck[];
  canSubmit: boolean;
}

export function scoreReadiness(checks: ReadinessCheck[]): Readiness {
  const missing = checks.filter((c) => !c.optional && !c.done);
  const tier: ReadinessTier = !checks.some((c) => c.done)
    ? "empty"
    : missing.length > 0
      ? "missing"
      : checks.every((c) => c.done)
        ? "complete"
        : "ready";
  return { tier, missing, canSubmit: missing.length === 0 };
}

const TIER_ACCENT: Record<ReadinessTier, string> = {
  empty: "var(--muted-foreground)",
  missing: "var(--warning)",
  ready: "var(--primary)",
  complete: "var(--success)",
};

const TIER_ICON = { empty: PenLine, missing: CircleDashed, ready: Check, complete: CheckCheck };

function CheckChip({ check }: { check: ReadinessCheck }) {
  const t = useTranslations("Compose");
  const blocking = !check.done && !check.optional;
  const Chip = check.onFix && !check.done ? "button" : "span";
  return (
    <Chip
      type={Chip === "button" ? "button" : undefined}
      onClick={Chip === "button" ? check.onFix : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        check.done
          ? "border-transparent bg-foreground/[0.07] text-foreground"
          : blocking
            ? "border-dashed border-warning/60 text-foreground hover:bg-warning/10"
            : "border-dashed border-border/70 text-muted-foreground hover:bg-accent",
      )}
    >
      {check.label}
      {check.optional && !check.done && (
        <span className="text-[10px] text-muted-foreground">{t("optional")}</span>
      )}
      {check.done ? (
        <Check className="size-3 text-success" strokeWidth={3} />
      ) : (
        <Minus className={cn("size-3", blocking ? "text-warning" : "opacity-50")} />
      )}
    </Chip>
  );
}

function Segments({ checks, tier }: { checks: ReadinessCheck[]; tier: ReadinessTier }) {
  // Done first, so the bar reads as filling up rather than a scatter of dots.
  const sorted = [...checks].sort((a, b) => Number(b.done) - Number(a.done));
  return (
    <div className="flex items-end gap-1" aria-hidden>
      {sorted.map((check, index) => (
        <span
          key={check.key}
          className="w-1.5 rounded-full transition-[background,height] duration-300"
          style={{
            height: `${12 + Math.round((index / Math.max(1, sorted.length - 1)) * 14)}px`,
            background: check.done ? TIER_ACCENT[tier] : "var(--border)",
            opacity: check.done ? 1 : 0.6,
          }}
        />
      ))}
    </div>
  );
}

/**
 * "Can this go out yet?" answered the Security Standing way: one icon that is
 * the verdict, a big line saying it, and chips for exactly what's there and
 * what isn't. A missing chip is a button straight to the field.
 */
export function ReadinessCard({
  checks,
  readyTitle,
  className,
}: {
  checks: ReadinessCheck[];
  /** e.g. "Ready to publish" — defaults to a neutral "Ready to go". */
  readyTitle?: string;
  className?: string;
}) {
  const t = useTranslations("Compose");
  const { tier, missing } = scoreReadiness(checks);
  const accent = TIER_ACCENT[tier];
  const Icon = TIER_ICON[tier];
  const title =
    tier === "empty"
      ? t("readinessEmpty")
      : tier === "missing"
        ? missing.length === 1
          ? t("missingOne", { label: missing[0].label })
          : t("readinessMissing", { count: missing.length })
        : tier === "ready"
          ? (readyTitle ?? t("readinessReady"))
          : t("readinessComplete");

  return (
    <section
      aria-label={t("readinessEyebrow")}
      className={cn("rounded-2xl border border-border/60 p-4", className)}
      style={{
        backgroundColor: "var(--card)",
        backgroundImage: `radial-gradient(28rem 12rem at 0% 0%, color-mix(in oklch, ${accent} 14%, transparent), transparent 70%)`,
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-xl"
          style={{ color: accent, background: `color-mix(in oklch, ${accent} 14%, transparent)` }}
        >
          <Icon className="size-[18px]" strokeWidth={tier === "complete" ? 2.5 : 2} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-[0.7rem] font-medium uppercase tracking-[0.16em]"
            style={{ color: accent }}
          >
            {t("readinessEyebrow")}
          </p>
          <h3 className="mt-0.5 font-display text-lg font-bold leading-snug tracking-tight text-balance">
            {title}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
            {t(`readiness${tier.charAt(0).toUpperCase()}${tier.slice(1)}Body`)}
          </p>
        </div>
        <Segments checks={checks} tier={tier} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {checks.map((check) => (
          <CheckChip key={check.key} check={check} />
        ))}
      </div>
    </section>
  );
}

/** The same verdict in one line, for dialog footers and tight headers. */
export function ReadinessMeter({ checks, className }: { checks: ReadinessCheck[]; className?: string }) {
  const t = useTranslations("Compose");
  const { tier, missing } = scoreReadiness(checks);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2 text-xs", className)}>
      <Segments checks={checks} tier={tier} />
      <span
        className={cn("truncate", tier === "missing" ? "text-foreground" : "text-muted-foreground")}
      >
        {tier === "missing"
          ? missing.length === 1
            ? t("missingOne", { label: missing[0].label })
            : t("readinessMissing", { count: missing.length })
          : tier === "empty"
            ? t("readinessEmpty")
            : t("readinessReady")}
      </span>
    </span>
  );
}
