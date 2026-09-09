"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Fingerprint, Minus, ShieldAlert, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";

import { MOTION } from "@/components/activity/motion/motion-tokens";
import { cn } from "@/lib/utils";

import { scorePosture, useSecurityState, type Posture, type PostureTier } from "./security-state";

/** Four rungs, four segments — the meter is the tier, not a percentage
 * dressed up as one. */
const SEGMENTS = 4;
const TIER_INDEX: Record<PostureTier, number> = {
  exposed: 0,
  basic: 1,
  strong: 2,
  maximum: 3,
};

/** One accent per tier, as a bare token name so the gradient, the meter and
 * the icon can never drift apart. */
const TIER_ACCENT: Record<PostureTier, string> = {
  exposed: "var(--destructive)",
  basic: "var(--warning)",
  strong: "var(--primary)",
  maximum: "var(--success)",
};

function FactorChip({
  icon: Icon,
  label,
  active,
  warn,
}: {
  icon: typeof Fingerprint;
  label: string;
  active: boolean;
  warn?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-transparent bg-foreground/[0.07] text-foreground"
          : "border-dashed border-border/70 text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {label}
      {warn ? (
        <ShieldAlert className="size-3 text-warning" />
      ) : active ? (
        <Check className="size-3 text-success" strokeWidth={3} />
      ) : (
        <Minus className="size-3 opacity-50" />
      )}
    </span>
  );
}

function Meter({ posture, animate }: { posture: Posture; animate: boolean }) {
  const filled = TIER_INDEX[posture.tier] + 1;
  const accent = TIER_ACCENT[posture.tier];

  return (
    <div className="flex items-end gap-1.5" aria-hidden>
      {Array.from({ length: SEGMENTS }, (_, index) => {
        const on = index < filled;
        return (
          <motion.span
            key={index}
            // Segments grow from the baseline in sequence, so the meter reads
            // as filling up rather than blinking into place.
            initial={animate ? { scaleY: 0.35, opacity: 0 } : false}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={
              animate
                ? { duration: MOTION.base, ease: MOTION.ease, delay: 0.06 * index }
                : { duration: 0 }
            }
            style={{
              originY: 1,
              height: `${16 + index * 7}px`,
              background: on ? accent : "var(--border)",
              opacity: on ? 1 : 0.55,
            }}
            className="w-2 rounded-full"
          />
        );
      })}
    </div>
  );
}

/**
 * The answer to "how protected is this account", which the page never gave
 * before — it listed methods and left the arithmetic to the reader.
 *
 * Not a `<Card>` on purpose: it's the one element on the page that should
 * read as a status, so it gets its own tinted ground and sits above the
 * stack rather than inside it.
 */
export function SecurityPosture() {
  const t = useTranslations("Settings");
  const { passkeys, totp, loading } = useSecurityState();
  const prefersReducedMotion = useReducedMotion();
  const animate = !prefersReducedMotion;

  if (loading) {
    return <div className="h-[7.5rem] animate-pulse rounded-2xl border border-border/60 bg-muted/30" />;
  }

  // A failed request leaves these null, which scores identically to "you have
  // nothing" — and telling someone their account is unprotected because an
  // endpoint blipped is worse than saying nothing. The cards below still
  // render their own error states.
  if (passkeys === null || totp === null) return null;

  const posture = scorePosture(passkeys, totp);
  const accent = TIER_ACCENT[posture.tier];

  const title = t(
    posture.tier === "exposed"
      ? "posture.exposedTitle"
      : posture.tier === "basic"
        ? "posture.basicTitle"
        : posture.tier === "strong"
          ? "posture.strongTitle"
          : "posture.maximumTitle",
  );
  const body = t(
    posture.tier === "exposed"
      ? "posture.exposedBody"
      : posture.tier === "basic"
        ? "posture.basicBody"
        : posture.tier === "strong"
          ? "posture.strongBody"
          : "posture.maximumBody",
  );

  const nextHref = posture.nextStep === "passkey" ? "#passkeys" : "#totp";
  const nextLabel =
    posture.nextStep === "passkey"
      ? t("posture.nextPasskey")
      : posture.nextStep === "totp"
        ? t("posture.nextTotp")
        : t("posture.nextRotate");

  return (
    <motion.section
      initial={animate ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: MOTION.base, ease: MOTION.ease }}
      aria-label={t("posture.regionLabel")}
      className="relative overflow-hidden rounded-2xl border border-border/60 p-5"
      style={{
        // A wash of the tier colour rather than a solid fill — enough to read
        // the state peripherally without turning the top of the page into a
        // banner that has to be dismissed.
        backgroundImage: `radial-gradient(32rem 14rem at 0% 0%, color-mix(in oklch, ${accent} 16%, transparent), transparent 70%)`,
        backgroundColor: "var(--card)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1">
          <p
            className="text-[0.7rem] font-medium uppercase tracking-[0.16em]"
            style={{ color: accent }}
          >
            {t("posture.eyebrow")}
          </p>
          <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-balance">
            {title}
          </h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground text-pretty">
            {body}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <FactorChip
              icon={Fingerprint}
              label={t("posture.factorPasskey")}
              active={posture.hasPasskey}
            />
            <FactorChip
              icon={Smartphone}
              label={t("posture.factorTotp")}
              active={posture.hasTotp || posture.totpNeedsRotation}
              warn={posture.totpNeedsRotation}
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-3">
          <Meter posture={posture} animate={animate} />
          {posture.nextStep && (
            <a
              href={nextHref}
              className="group inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:border-border hover:bg-muted/50"
            >
              {nextLabel}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </a>
          )}
        </div>
      </div>
    </motion.section>
  );
}
