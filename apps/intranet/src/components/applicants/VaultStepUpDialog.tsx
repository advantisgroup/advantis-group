"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useAction } from "convex/react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";

/**
 * Step-up re-authentication for granting/revoking Applicant Management
 * access: re-enter the vault password at the moment of the sensitive action,
 * even if the vault is already unlocked for browsing. Reuses the vault's own
 * `unlock` action — verifying the password here also (harmlessly) refreshes
 * the caller's regular unlock.
 */
export function VaultStepUpDialog({
  open,
  onOpenChange,
  onVerified,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: () => void;
}) {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const unlock = useAction(api.hr.vault.unlock);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setPassword("");
    setError(null);
  }

  async function submit() {
    if (!password.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await unlock({ password });
      reset();
      onOpenChange(false);
      onVerified();
    } catch {
      setError(t("vaultIncorrectPassword"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
      title={t("vaultStepUpTitle")}
      description={t("vaultStepUpDescription")}
      contentClassName="max-w-sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button disabled={submitting || !password.trim()} onClick={() => void submit()}>
            {t("vaultUnlock")}
          </Button>
        </>
      }
    >
      <Input
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t("vaultPasswordPlaceholder")}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </ResponsiveDialog>
  );
}
