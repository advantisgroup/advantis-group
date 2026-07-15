"use client";

import { type ReactNode, useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { Lock, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

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

/**
 * Second, independent password gate in front of the whole Applicant
 * Management area — on top of the normal applicantAccess/delegate checks,
 * for defense-in-depth against a leaked or unattended session. Wraps every
 * `/applicants/*` route from the top-level layout, so nothing underneath
 * ever mounts (and fires its Convex queries) while locked.
 */
export function ApplicantVaultGate({ children }: { children: ReactNode }) {
  const t = useTranslations("Applicants");
  const status = useQuery(api.applicantVault.status);
  const unlock = useAction(api.applicantVault.unlock);
  const setPassword = useAction(api.applicantVault.setPassword);
  const handleError = useErrorHandler();

  const [password, setPasswordInput] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
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

  async function handleUnlock() {
    if (!password.trim()) return;
    setSubmitting(true);
    try {
      await unlock({ password });
      setPasswordInput("");
    } catch (e) {
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

  if (!status.passwordIsSet) {
    if (!status.isAdmin) {
      return (
        <div className="mx-auto max-w-md py-20 text-center">
          <ShieldCheck className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">
            {t("vaultNotConfiguredUser")}
          </p>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-sm py-16">
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1 text-center">
              <ShieldCheck className="mx-auto size-6 text-primary" />
              <p className="font-semibold">{t("vaultSetupTitle")}</p>
              <p className="text-sm text-muted-foreground">
                {t("vaultSetupDescription")}
              </p>
            </div>
            <Input
              type="password"
              value={password}
              onChange={e => setPasswordInput(e.target.value)}
              placeholder={t("vaultPasswordPlaceholder")}
              autoComplete="new-password"
            />
            <Input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder={t("vaultConfirmPasswordPlaceholder")}
              autoComplete="new-password"
              onKeyDown={e => {
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
            <p className="text-sm text-muted-foreground">
              {t("vaultLockedDescription")}
            </p>
          </div>
          <Input
            type="password"
            value={password}
            onChange={e => setPasswordInput(e.target.value)}
            placeholder={t("vaultPasswordPlaceholder")}
            autoComplete="current-password"
            autoFocus
            onKeyDown={e => {
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
        </CardContent>
      </Card>
    </div>
  );
}
