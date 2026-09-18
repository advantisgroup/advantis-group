"use client";

import { type ReactNode, useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { useAuth } from "@clerk/nextjs";
import { startAuthentication } from "@simplewebauthn/browser";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { KeyRound, Loader2, Lock, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { StepUpForm } from "@/components/auth/StepUpForm";
import { ForgotPasswordPanel } from "@/components/password-reset/ForgotPasswordPanel";
import { jsonOrThrow } from "@/components/security/security-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useErrorHandler } from "@/hooks/use-error-handler";

const NOTICE_DISMISSED_KEY = "vault-legacy-password-notice-dismissed";

function LegacyPasswordNotice({ deadlineAt }: { deadlineAt: number }) {
  const t = useTranslations("Applicants");
  const format = useFormatter();
  const [dismissed, setDismissed] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NOTICE_DISMISSED_KEY);
      if (raw) setDismissed(Number(raw));
    } catch {
      // Blocked storage just means the notice shows every visit.
    }
  }, []);

  if (dismissed === deadlineAt) return null;

  function dismiss() {
    setDismissed(deadlineAt);
    try {
      window.localStorage.setItem(NOTICE_DISMISSED_KEY, String(deadlineAt));
    } catch {
      // Still dismissed for this visit.
    }
  }

  return (
    <p className="flex items-start gap-2 text-left text-[13px] text-muted-foreground">
      <span className="min-w-0 flex-1 text-pretty">
        {t("vaultLegacyPasswordNotice", {
          date: format.dateTime(new Date(deadlineAt), {
            day: "numeric",
            month: "long",
          }),
        })}
      </span>
      <button
        type="button"
        aria-label={t("vaultLegacyPasswordNoticeDismiss")}
        onClick={dismiss}
        className="-mr-1 shrink-0 rounded-md p-1 hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </p>
  );
}

function GatePanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <div className="rounded-2xl border border-border/70 bg-card p-6">
        <Lock className="size-5 text-muted-foreground" />
        <h2 className="mt-4 text-base font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">{description}</p>
        <div className="mt-6 space-y-4">{children}</div>
      </div>
    </div>
  );
}

/** Re-lock the vault right away instead of waiting for it to expire. */
export function LockVaultButton() {
  const t = useTranslations("Applicants");
  const status = useQuery(api.hr.vault.status);
  const lockVault = useMutation(api.hr.vault.lock);

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
 * A second lock in front of all of Applicant Management, on top of the
 * applicantAccess/delegate checks, against a leaked or unattended session.
 * Wraps every `/applicants/*` route, so nothing underneath mounts (or fires
 * its queries) while locked.
 */
export function ApplicantVaultGate({ children }: { children: ReactNode }) {
  const t = useTranslations("Applicants");
  const status = useQuery(api.hr.vault.status);
  const unlock = useAction(api.hr.vault.unlock);
  const setPassword = useAction(api.hr.vault.setPassword);
  const handleError = useErrorHandler();
  const { getToken } = useAuth();

  const [password, setPasswordInput] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  // "Forgot password" only shows up once a password has actually been wrong.
  const [attemptFailed, setAttemptFailed] = useState(false);
  // Expiry is just time passing, which Convex never pushes — a local tick
  // is what flips the gate back to locked.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  if (status === undefined) return null;

  const expired = status.unlocked && status.expiresAt !== null && status.expiresAt <= now;
  if (status.unlocked && !expired) return <>{children}</>;

  if (status.needsAreaStepUp) {
    return (
      <GatePanel title={t("vaultReverifyTitle")} description={t("vaultReverifyDescription")}>
        <StepUpForm
          availableMethods={status.areaStepUpAvailableMethods}
          context="area_reverify"
          area="applicant_vault"
          onVerified={() => {}}
        />
      </GatePanel>
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
      const code =
        e instanceof ConvexError && typeof e.data === "object" && e.data !== null
          ? (e.data as { code?: string }).code
          : undefined;
      handleError(
        e,
        code === "legacy_password_sunset"
          ? t("vaultLegacyPasswordSunset")
          : t("vaultIncorrectPassword"),
      );
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
        await fetch(`${apiUrl}/passkeys/authentication/options`, {
          method: "POST",
        }),
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
    } catch (e) {
      // Backing out of the passkey prompt isn't an error.
      if (e instanceof Error && e.name === "NotAllowedError") return;
      handleError(e, t("vaultPasskeyError"));
    } finally {
      setPasskeyBusy(false);
    }
  }

  // A passkey is a full way in on its own, so a member who has one is never
  // made to invent a vault password first.
  if (!status.passwordIsSet && !status.hasPasskey) {
    return (
      <GatePanel title={t("vaultSetupTitle")} description={t("vaultSetupDescription")}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSetPassword();
          }}
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder={t("vaultPasswordPlaceholder")}
            aria-label={t("vaultPasswordPlaceholder")}
            autoComplete="new-password"
            autoFocus
          />
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t("vaultConfirmPasswordPlaceholder")}
            aria-label={t("vaultConfirmPasswordPlaceholder")}
            autoComplete="new-password"
          />
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="animate-spin" />}
            {t("vaultSetPassword")}
          </Button>
        </form>
      </GatePanel>
    );
  }

  const canUsePassword = status.passwordIsSet && !status.passwordRetired;

  return (
    <GatePanel
      title={t("vaultLockedTitle")}
      description={
        canUsePassword ? t("vaultLockedDescription") : t("vaultLockedPasskeyDescription")
      }
    >
      {status.hasPasskey && (
        <Button
          className="w-full"
          variant={canUsePassword ? "outline" : "default"}
          disabled={passkeyBusy}
          onClick={() => void handleUnlockWithPasskey()}
        >
          {passkeyBusy ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {t("vaultUnlockWithPasskey")}
        </Button>
      )}
      {status.hasPasskey && canUsePassword && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          {t("vaultOrPassword")}
          <div className="h-px flex-1 bg-border" />
        </div>
      )}
      {canUsePassword && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleUnlock();
          }}
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder={t("vaultPasswordPlaceholder")}
            aria-label={t("vaultPasswordPlaceholder")}
            autoComplete="current-password"
            autoFocus={!status.hasPasskey}
          />
          <Button type="submit" className="w-full" disabled={submitting || !password.trim()}>
            {submitting && <Loader2 className="animate-spin" />}
            {t("vaultUnlock")}
          </Button>
        </form>
      )}
      {attemptFailed && canUsePassword && <ForgotPasswordPanel scope="hr" />}
      {canUsePassword && status.legacyPasswordSunsetDeadline !== null && (
        <LegacyPasswordNotice deadlineAt={status.legacyPasswordSunsetDeadline} />
      )}
    </GatePanel>
  );
}
