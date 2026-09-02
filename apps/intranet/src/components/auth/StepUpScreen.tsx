"use client";

import { useEffect, useState } from "react";

import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { BrandLogo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-muted/30 p-4 transition-opacity ease-out"
      style={{ transitionDuration: `${FADE_MS}ms`, opacity: phase === "fading" ? 0 : 1 }}
    >
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 p-6">
          <div className="flex justify-center">
            {showingSuccess ? (
              <CheckCircle2 className="size-10 animate-in fade-in-0 zoom-in-50 text-success duration-300" />
            ) : (
              <BrandLogo />
            )}
          </div>
          {showingSuccess ? (
            <div className="text-center">
              <h1 className="text-lg font-semibold tracking-tight">{t("gateVerifiedTitle")}</h1>
            </div>
          ) : status.state === "needs_verification" ? (
            <>
              <div className="text-center">
                <h1 className="text-lg font-semibold tracking-tight">{t("gateVerifyTitle")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("gateVerifyBody")}</p>
              </div>
              <StepUpForm
                availableMethods={status.availableMethods}
                context="sign_in"
                onVerified={markVerifiedOptimistically}
              />
            </>
          ) : status.state === "needs_enrollment" ? (
            <>
              <div className="text-center">
                <h1 className="text-lg font-semibold tracking-tight">{t("gateEnrollTitle")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {status.needsMfa && status.needsPasskey
                    ? t("gateEnrollBodyBoth")
                    : status.needsMfa
                      ? t("gateEnrollBodyMfa")
                      : t("gateEnrollBodyPasskey")}
                </p>
              </div>
              <Button asChild className="w-full">
                <Link href={status.needsPasskey ? "/settings/account#passkeys" : "/settings/account#totp"}>
                  {t("gateEnrollCta")}
                </Link>
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
