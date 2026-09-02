"use client";

import { useEffect, useState } from "react";

import { CheckCircle2, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandLogo } from "@/components/Logo";
import { TotpSettingsCard } from "@/components/mfa/TotpSettingsCard";
import { PasskeySettingsCard } from "@/components/passkeys/PasskeySettingsCard";
import { useTheme } from "@/components/theme/theme-provider";

import { StepUpForm, type StepMethod } from "./StepUpForm";

export type StepUpStatus =
  | { state: "satisfied" }
  | { state: "warning"; graceDeadline: number; needsPasskeyEnrollment: boolean }
  | { state: "needs_verification"; requiredLevel: number; availableMethods: StepMethod[] }
  | { state: "needs_enrollment"; needsMfa: boolean; needsPasskey: boolean };

/** How long the checkmark sits before fading — long enough to read as a
 * deliberate confirmation rather than a flicker, even when the underlying
 * `stepUp.status` query catches up to "satisfied" almost instantly. */
const SUCCESS_HOLD_MS = 2500;
const FADE_MS = 400;

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
      className="fixed bottom-4 right-4 z-10 text-muted-foreground/60 transition-colors hover:text-foreground"
    >
      <Icon className="size-4" />
    </button>
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

  function markVerifiedOptimistically() {
    setPhase((current) => (current === "active" ? "success" : current));
  }

  const showingSuccess = phase !== "active";
  // Enrollment embeds the real TotpSettingsCard/PasskeySettingsCard forms
  // right here rather than linking to /settings/account — that page is
  // behind this same gate, so a link to it would just loop back to this
  // screen. Needs more room than the plain verify-code case.
  const isEnrolling = !showingSuccess && status.state === "needs_enrollment";

  return (
    <div
      className="app-atmosphere relative flex min-h-screen items-center justify-center p-4 transition-opacity ease-out"
      style={{ transitionDuration: `${FADE_MS}ms`, opacity: phase === "fading" ? 0 : 1 }}
    >
      <div className={isEnrolling ? "w-full max-w-md space-y-6" : "w-full max-w-sm space-y-5"}>
        <div className="space-y-4 text-center">
          <div className="flex justify-center">
            {showingSuccess ? (
              <CheckCircle2 className="size-10 animate-in fade-in-0 zoom-in-50 text-success duration-300" />
            ) : (
              <BrandLogo />
            )}
          </div>
          {showingSuccess ? (
            <h1 className="text-lg font-semibold tracking-tight">{t("gateVerifiedTitle")}</h1>
          ) : status.state === "needs_verification" ? (
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{t("gateVerifyTitle")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("gateVerifyBody")}</p>
            </div>
          ) : status.state === "needs_enrollment" ? (
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{t("gateEnrollTitle")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {status.needsMfa && status.needsPasskey
                  ? t("gateEnrollBodyBoth")
                  : status.needsMfa
                    ? t("gateEnrollBodyMfa")
                    : t("gateEnrollBodyPasskey")}
              </p>
            </div>
          ) : null}
        </div>

        {!showingSuccess && status.state === "needs_verification" && (
          <StepUpForm
            availableMethods={status.availableMethods}
            context="sign_in"
            onVerified={markVerifiedOptimistically}
          />
        )}

        {isEnrolling && status.state === "needs_enrollment" && (
          <div className="space-y-4">
            {status.needsMfa && <TotpSettingsCard />}
            {status.needsPasskey && <PasskeySettingsCard />}
          </div>
        )}
      </div>

      <RawThemeToggle />
    </div>
  );
}
