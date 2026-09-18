"use client";

import { type ReactNode, useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { useAuth } from "@clerk/nextjs";
import { startAuthentication } from "@simplewebauthn/browser";
import { useAction, useMutation, useQuery } from "convex/react";
import { KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { StepUpForm } from "@/components/auth/StepUpForm";
import { ForgotPasswordPanel } from "@/components/password-reset/ForgotPasswordPanel";
import { jsonOrThrow } from "@/components/security/security-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useErrorHandler } from "@/hooks/use-error-handler";

/** Small header button to re-lock the vault immediately, without waiting for
 * the unlock to expire on its own. Only renders once unlocked. */
export function LockVaultButton() {
  const t = useTranslations("Applicants");
  const status = useQuery(api.applicantVault.status);
  const lockVault = useMutation(api.applicantVault.lock);

  if (!status?.unlocked) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      aria-label={t("vaultLockNow")}
      onClick={() => void lockVault({})}
    >
      <Lock className="size-4" />
      <span className="hidden md:inline">{t("vaultLockNow")}</span>
    </Button>
  );
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "http://localhost:3002";

type PasskeyOptionsResponse = {
  options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
  flowId: string;
};

/**
 * Second, independent password gate in front of the whole Applicant
 * Management area — on top of the normal applicantAccess/delegate checks,
 * for defense-in-depth against a leaked or unattended session. Wraps every
 * `/applicants/*` route from the top-level layout, so nothing underneath
 * ever mounts (and fires its Convex queries) while locked.
 *
 * Phase 4 of docs/future-features/21_auth-consolidation.md: once a member
 * has a passkey registered, it's offered as a faster alternative to typing
 * the vault password — never a replacement, since the password stays as
 * the setup step and the recovery path if the passkey is unavailable.
 */
export function ApplicantVaultGate({ children }: { children: ReactNode }) {
  const t = useTranslations("Applicants");
  const status = useQuery(api.applicantVault.status);
  const unlock = useAction(api.applicantVault.unlock);
  const setPassword = useAction(api.applicantVault.setPassword);
  const handleError = useErrorHandler();
  const { getToken } = useAuth();

  const [password, setPasswordInput] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  // The forgot-password route only appears once the password has actually
  // been got wrong — offering it up front invites skipping the password
  // instead of remembering it.
  const [attemptFailed, setAttemptFailed] = useState(false);
  // Convex only re-pushes `status` when something changes server-side —
  // expiry itself is just wall-clock time passing, so a local tick is what
  // actually flips the UI back to locked once expiresAt has passed.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  if (status === undefined) return null;

  const expired = status.unlocked && status.expiresAt !== null && status.expiresAt <= now;
  if (status.unlocked && !expired) return <>{children}</>;

  // Phase 7 of docs/future-features/21_auth-consolidation.md: on top of the
  // vault's own (much shorter) unlock above, an intranet-side
  // re-verification older than 14 days blocks even attempting one — show
  // that step-up first instead of a password/passkey prompt that would just
  // fail server-side. `status` is a live Convex query, so clearing this
  // re-renders straight past it once done, with no manual refetch needed.
  if (status.needsAreaStepUp) {
    return (
      <div className="mx-auto max-w-sm py-16">
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1 text-center">
              <ShieldCheck className="mx-auto size-6 text-primary" />
              <p className="font-semibold">{t("vaultReverifyTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("vaultReverifyDescription")}</p>
            </div>
            <StepUpForm
              availableMethods={status.areaStepUpAvailableMethods}
              context="area_reverify"
              area="applicant_vault"
              onVerified={() => {}}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  async function handleUnlock() {
    if (!password.trim()) return;
    setSubmitting(true);
    try {
      await unlock({ password });
      setPasswordInput("");
    } catch (e) {
      setAttemptFailed(true);
      handleError(e, t("vaultIncorrectPassword"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetPassword() {
    if (password.length < 8) {
      toast.error(t("vaultPasswordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t("vaultPasswordMismatch"));
      return;
    }
    setSubmitting(true);
    try {
      await setPassword({ password });
      toast.success(t("vaultPasswordSetSuccess"));
      setPasswordInput("");
      setConfirmPassword("");
    } catch (e) {
      handleError(e);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnlockWithPasskey() {
    setPasskeyBusy(true);
    try {
      const { options, flowId } = (await jsonOrThrow(
        await fetch(`${apiUrl}/passkeys/authentication/options`, { method: "POST" }),
      )) as PasskeyOptionsResponse;
      const credential = await startAuthentication({ optionsJSON: options });
      const token = await getToken();
      await jsonOrThrow(
        await fetch(`${apiUrl}/applicant-vault/unlock-passkey`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ flowId, response: credential }),
        }),
      );
      // No local state to clear — `status` is a reactive Convex query, so
      // the gate re-renders as unlocked the moment the mutation commits.
    } catch (e) {
      // A cancelled/no-op WebAuthn prompt throws too (the user just backed
      // out) — nothing useful to show for that beyond staying locked.
      if (e instanceof Error && e.name === "NotAllowedError") return;
      handleError(e, t("vaultPasskeyError"));
    } finally {
      setPasskeyBusy(false);
    }
  }

  if (!status.passwordIsSet) {
    return (
      <div className="mx-auto max-w-sm py-16">
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1 text-center">
              <ShieldCheck className="mx-auto size-6 text-primary" />
              <p className="font-semibold">{t("vaultSetupTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("vaultSetupDescription")}</p>
            </div>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder={t("vaultPasswordPlaceholder")}
              autoComplete="new-password"
            />
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t("vaultConfirmPasswordPlaceholder")}
              autoComplete="new-password"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSetPassword();
              }}
            />
            <Button
              className="w-full"
              disabled={submitting}
              onClick={() => void handleSetPassword()}
            >
              {t("vaultSetPassword")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm py-16">
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-1 text-center">
            <Lock className="mx-auto size-6 text-primary" />
            <p className="font-semibold">{t("vaultLockedTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("vaultLockedDescription")}</p>
          </div>
          {status.hasPasskey && (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={passkeyBusy}
                onClick={() => void handleUnlockWithPasskey()}
              >
                {passkeyBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                {t("vaultUnlockWithPasskey")}
              </Button>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                {t("vaultOrPassword")}
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <Input
            type="password"
            value={password}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder={t("vaultPasswordPlaceholder")}
            autoComplete="current-password"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleUnlock();
            }}
          />
          <Button
            className="w-full"
            disabled={submitting || !password.trim()}
            onClick={() => void handleUnlock()}
          >
            {t("vaultUnlock")}
          </Button>
          {attemptFailed && <ForgotPasswordPanel scope="hr" />}
        </CardContent>
      </Card>
    </div>
  );
}
