"use client";

import { useEffect, useState } from "react";

import { useClerk } from "@clerk/nextjs";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, KeyRound, Moon, ShieldCheck, Smartphone, Sun } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandLogo } from "@/components/Logo";
import { TotpSettingsCard } from "@/components/mfa/TotpSettingsCard";
import { PasskeySettingsCard } from "@/components/passkeys/PasskeySettingsCard";
import { useCurrentUser } from "@/components/providers/current-user";
import { SecurityStateProvider } from "@/components/security/security-state";
import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { SettingsLayoutProvider } from "@/components/ui/settings-rows";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { cn } from "@/lib/utils";

import { StepUpForm, type StepMethod } from "./StepUpForm";

export type StepUpStatus =
  | { state: "satisfied" }
  | { state: "warning"; graceDeadline: number; needsPasskeyEnrollment: boolean }
  | {
      state: "needs_verification";
      requiredLevel: number;
      availableMethods: StepMethod[];
      passkeyFallback: boolean;
    }
  | { state: "needs_enrollment"; needsMfa: boolean; needsPasskey: boolean };

/** How long the checkmark sits before fading — long enough to read as a
 * deliberate confirmation rather than a flicker, even when the underlying
 * `stepUp.status` query catches up to "satisfied" almost instantly. */
const SUCCESS_HOLD_MS = 2500;
const FADE_MS = 400;
/** How long an optimistic checkmark waits for the server to agree before it
 * gives up and re-renders whatever the status actually says. The form fires
 * `onVerified` on any `ok: true`, which isn't the same as "the gate opened" —
 * a recovery code clears sign-in and immediately raises a re-enrollment
 * requirement, and without this the screen would sit on a green tick with
 * nothing behind it. */
const OPTIMISTIC_GRACE_MS = 2500;

const EASE = [0.23, 1, 0.32, 1] as const;

/** Icon-only, no card/border/fill — a screen someone can get stuck on for a
 * while shouldn't strand them on the wrong theme just because every other
 * toggle in the app lives inside the (currently unreachable) app shell. */
function RawThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const Icon = resolvedTheme === "dark" ? Moon : Sun;
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
      className="fixed bottom-4 right-4 z-10 p-2 text-muted-foreground/60 transition-colors hover:text-foreground"
    >
      <Icon className="size-4" />
    </button>
  );
}

/** One row of the enrollment checklist. Kept flat (no nested card chrome
 * around the settings card it reveals) — stacking a bordered box inside a
 * bordered box inside the screen's own panel was three frames deep. */
function EnrollStep({
  index,
  total,
  icon: Icon,
  title,
  body,
  children,
}: {
  index: number;
  total: number;
  icon: typeof Smartphone;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h2 className="text-sm font-semibold text-balance">{title}</h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
              {index}/{total}
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">{body}</p>
        </div>
      </div>
      <div className="sm:pl-11">{children}</div>
    </div>
  );
}

/** Full-screen, non-dismissible gate — mounted by `AppGate` in place of the
 * app whenever the current session hasn't cleared what sign-in policy
 * requires. Nothing underneath ever renders while this is up, same as
 * `ApplicantVaultGate`'s lock screen.
 *
 * `onDismiss` is only ever called after a full success → hold → fade
 * sequence, and only once the live `status` itself confirms "satisfied" —
 * never purely on a timer — so a slow reactive update can't let `AppShell`
 * render a beat before the server actually agrees the session is verified. */
export function StepUpScreen({
  status,
  onDismiss,
}: {
  status: StepUpStatus;
  onDismiss: () => void;
}) {
  const t = useTranslations("StepUp");
  const user = useCurrentUser();
  const clerk = useClerk();
  const keyboardInset = useKeyboardInset();
  const prefersReducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<"active" | "success" | "fading">("active");

  // Two paths land here: the form's own onVerified fires the instant the API
  // call succeeds (optimistic), or the reactive status query flips to
  // "satisfied" on its own — whichever comes first starts the checkmark.
  useEffect(() => {
    if (status.state === "satisfied" && phase === "active") setPhase("success");
  }, [status.state, phase]);

  // The hold-then-fade only starts once the server has actually confirmed
  // satisfied — if the form fired first, this just waits for the query.
  useEffect(() => {
    if (phase !== "success" || status.state !== "satisfied") return;
    const holdTimer = setTimeout(() => setPhase("fading"), SUCCESS_HOLD_MS);
    return () => clearTimeout(holdTimer);
  }, [phase, status.state]);

  useEffect(() => {
    if (phase !== "fading") return;
    const fadeTimer = setTimeout(onDismiss, FADE_MS);
    return () => clearTimeout(fadeTimer);
  }, [phase, onDismiss]);

  // The escape hatch for an optimistic success the server never confirms.
  useEffect(() => {
    if (phase !== "success" || status.state === "satisfied") return;
    const giveUp = setTimeout(() => setPhase("active"), OPTIMISTIC_GRACE_MS);
    return () => clearTimeout(giveUp);
  }, [phase, status.state]);

  function markVerifiedOptimistically() {
    setPhase((current) => (current === "active" ? "success" : current));
  }

  const showingSuccess = phase !== "active";
  // Enrollment embeds the real TotpSettingsCard/PasskeySettingsCard forms
  // right here rather than linking to /settings/account — that page is
  // behind this same gate, so a link to it would just loop back to this
  // screen. Needs more room than the plain verify-code case.
  const isEnrolling = !showingSuccess && status.state === "needs_enrollment";
  const enrollTotal =
    status.state === "needs_enrollment" ? Number(status.needsMfa) + Number(status.needsPasskey) : 0;

  const transition = prefersReducedMotion ? { duration: 0 } : { duration: 0.3, ease: EASE };

  return (
    <div
      // `overflow-y-auto` + `m-auto` on the child rather than `justify-center`:
      // a centred flex child taller than its container gets clipped at the top
      // with no way to scroll back to it, which is exactly what the enrollment
      // path does on a phone once a QR code is on screen.
      className="app-atmosphere relative flex min-h-[100dvh] flex-col overflow-y-auto px-4 py-8 transition-opacity ease-out sm:px-6"
      style={{
        transitionDuration: `${FADE_MS}ms`,
        opacity: phase === "fading" ? 0 : 1,
        // The layout viewport doesn't shrink for the on-screen keyboard, so a
        // vertically-centred column ends up centred behind it. Shifting by the
        // measured inset keeps the slots and the resend link in view.
        paddingBottom: keyboardInset ? keyboardInset : undefined,
      }}
    >
      <div className={cn("m-auto w-full", isEnrolling ? "max-w-lg" : "max-w-sm")}>
        <AnimatePresence mode="wait" initial={false}>
          {showingSuccess ? (
            <motion.div
              key="success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={transition}
              className="flex flex-col items-center gap-4 text-center"
            >
              <motion.span
                initial={prefersReducedMotion ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 420, damping: 22 }
                }
                className="flex size-14 items-center justify-center rounded-full bg-success/12 text-success"
              >
                <Check className="size-7" strokeWidth={2.5} />
              </motion.span>
              <h1 className="text-lg font-semibold tracking-tight text-balance">
                {t("gateVerifiedTitle")}
              </h1>
              <p className="text-sm text-muted-foreground text-pretty">{t("gateVerifiedBody")}</p>
            </motion.div>
          ) : status.state === "needs_verification" ? (
            <motion.div
              key="verify"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={transition}
              className="space-y-7"
            >
              <div className="space-y-3 text-center">
                <div className="flex justify-center">
                  <BrandLogo />
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-balance">
                  {t("gateVerifyTitle")}
                </h1>
              </div>

              {/* The "what do I enter" line lives in the form, which is what
                  actually knows the selected method. The server only lists
                  methods that would actually clear the bar, so an empty list
                  means there is genuinely nothing to type — show the way out
                  instead of a form that cannot succeed. */}
              {status.availableMethods.length > 0 ? (
                <StepUpForm
                  availableMethods={status.availableMethods}
                  context="sign_in"
                  email={user.email}
                  onVerified={markVerifiedOptimistically}
                />
              ) : (
                <p className="text-center text-sm leading-relaxed text-muted-foreground text-pretty">
                  {status.passkeyFallback ? t("passkeyOnlyBody") : t("noMethodBody")}
                </p>
              )}

              {status.passkeyFallback && (
                <Button
                  variant={status.availableMethods.length > 0 ? "outline" : "default"}
                  className="w-full"
                  onClick={() =>
                    void clerk.signOut({
                      redirectUrl: `/sign-in/passkey?redirect_url=${encodeURIComponent(window.location.href)}`,
                    })
                  }
                >
                  <KeyRound className="size-4" />
                  {t("usePasskeyInstead")}
                </Button>
              )}

              {/*
               * Why this screen appeared, parked deliberately quietly: small,
               * dimmed, below the fold of attention, and worded so it never
               * names the actual signal that fired. Someone who wants the
               * reason can find it; it doesn't tell an attacker holding a
               * stolen session which heuristic they tripped, and it doesn't
               * make an ordinary sign-in feel accused of something.
               */}
              <div className="space-y-1.5 border-t border-border/50 pt-4 text-center">
                <p className="text-xs leading-relaxed text-muted-foreground/60 text-pretty">
                  {t("gateVerifyWhy")}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground/60 text-pretty">
                  {t("gateVerifyHelp")}
                </p>
              </div>
            </motion.div>
          ) : status.state === "needs_enrollment" ? (
            <motion.div
              key="enroll"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={transition}
              className="space-y-6 py-2"
            >
              <div className="space-y-3 text-center">
                <div className="flex justify-center">
                  <BrandLogo />
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-balance">
                  {t("gateEnrollTitle")}
                </h1>
                <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                  {status.needsMfa && status.needsPasskey
                    ? t("gateEnrollBodyBoth")
                    : status.needsMfa
                      ? t("gateEnrollBodyMfa")
                      : t("gateEnrollBodyPasskey")}
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                  {t("gateEnrollWhy")}
                </p>
              </div>

              {/* Same provider the account page uses — the cards read their
                  state from it, so enrolling one factor here immediately
                  refreshes the other's view too. */}
              <SecurityStateProvider>
                {/* The gate is a narrow column (max-w-lg, further indented by
                    EnrollStep's sm:pl-11) — nowhere near enough room for
                    SettingsSection's default split grid, which crushed the
                    passkey row/help-links/button into an unreadable sliver. */}
                <SettingsLayoutProvider value="stacked">
                  <div className="space-y-6">
                    {status.needsMfa && (
                      <EnrollStep
                        index={1}
                        total={enrollTotal}
                        icon={Smartphone}
                        title={t("enrollTotpTitle")}
                        body={t("enrollTotpBody")}
                      >
                        <TotpSettingsCard />
                      </EnrollStep>
                    )}
                    {status.needsPasskey && (
                      <EnrollStep
                        index={status.needsMfa ? 2 : 1}
                        total={enrollTotal}
                        icon={KeyRound}
                        title={t("enrollPasskeyTitle")}
                        body={t("enrollPasskeyBody")}
                      >
                        <PasskeySettingsCard />
                      </EnrollStep>
                    )}
                  </div>
                </SettingsLayoutProvider>
              </SecurityStateProvider>

              <p className="flex items-start gap-2 border-t border-border/60 pt-4 text-xs leading-relaxed text-muted-foreground/80 text-pretty">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                <span>{t("gateEnrollHelp")}</span>
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <RawThemeToggle />
    </div>
  );
}
