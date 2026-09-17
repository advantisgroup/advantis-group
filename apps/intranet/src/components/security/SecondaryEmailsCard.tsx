"use client";

import { useState } from "react";

import { Loader2, Mail, MailCheck, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import {
  jsonOrThrow,
  useSecurityState,
  type SecondaryEmail,
} from "@/components/security/security-state";

/**
 * Phase 2 of docs/future-features/21_auth-consolidation.md: additional
 * verified addresses an intranet account is reachable at — a work-issued
 * Performance address, an HR-only address — so later phases can route
 * sign-in and password resets through either one. Same card shape as
 * `PasskeySettingsCard`/`TotpSettingsCard` next to it.
 */
export function SecondaryEmailsCard() {
  const t = useTranslations("Settings");
  const { secondaryEmails, refresh, apiRequest } = useSecurityState();
  const [dialog, setDialog] = useState<"add" | "remove" | null>(null);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [selected, setSelected] = useState<SecondaryEmail | null>(null);
  const [busy, setBusy] = useState(false);

  function closeDialog() {
    if (busy) return;
    setDialog(null);
    setStep("email");
    setEmail("");
    setCode("");
    setSelected(null);
  }

  function openAdd() {
    setEmail("");
    setStep("email");
    setDialog("add");
  }

  async function requestCode() {
    setBusy(true);
    try {
      const result = (await jsonOrThrow(
        await apiRequest("/secondary-emails/request-code", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        }),
      )) as { alreadyVerified: boolean };
      if (result.alreadyVerified) {
        await refresh();
        closeDialog();
        toast.success(t("secondaryEmailAdded"));
        return;
      }
      setCode("");
      setStep("code");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("secondaryEmailAddError"));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setBusy(true);
    try {
      const result = (await jsonOrThrow(
        await apiRequest("/secondary-emails/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: email.trim(), code: code.trim() }),
        }),
      )) as { ok: boolean; message?: string };
      if (!result.ok) {
        toast.error(result.message ?? t("secondaryEmailCodeError"));
        return;
      }
      await refresh();
      closeDialog();
      toast.success(t("secondaryEmailAdded"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("secondaryEmailCodeError"));
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (!selected) return;
    setBusy(true);
    try {
      await jsonOrThrow(
        await apiRequest(`/secondary-emails/${selected._id}`, { method: "DELETE" }),
      );
      await refresh();
      closeDialog();
      toast.success(t("secondaryEmailRemoved"));
    } catch (error) {
      console.error("[secondary-emails] removal failed", error);
      toast.error(t("secondaryEmailRemoveError"));
    } finally {
      setBusy(false);
    }
  }

  const dialogs = (
    <>
      <Dialog open={dialog === "add"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("addSecondaryEmail")}</DialogTitle>
            <DialogDescription>
              {step === "email"
                ? t("addSecondaryEmailHint")
                : t("secondaryEmailCodeHint", { email })}
            </DialogDescription>
          </DialogHeader>
          {step === "email" ? (
            <div className="space-y-2">
              <Label htmlFor="secondary-email">{t("secondaryEmailLabel")}</Label>
              <Input
                id="secondary-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="secondary-email-code">{t("secondaryEmailCodeLabel")}</Label>
              <Input
                id="secondary-email-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={busy}>
              {t("cancel")}
            </Button>
            {step === "email" ? (
              <Button disabled={busy || !email.trim()} onClick={() => void requestCode()}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {t("secondaryEmailSendCode")}
              </Button>
            ) : (
              <Button disabled={busy || code.length !== 6} onClick={() => void verifyCode()}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {t("secondaryEmailVerify")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "remove"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("removeSecondaryEmail")}</DialogTitle>
            <DialogDescription>{t("removeSecondaryEmailHint")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void removeSelected()}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t("removeSecondaryEmail")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return (
    <div id="secondary-emails" data-hash-anchor>
      <SettingsSection title={t("secondaryEmails")} description={t("secondaryEmailsHint")}>
        {secondaryEmails === null ? (
          <div className="flex justify-center px-4 py-5 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : secondaryEmails.length === 0 ? (
          <SettingsRow
            title={
              <span className="font-normal text-muted-foreground">{t("noSecondaryEmails")}</span>
            }
          />
        ) : (
          secondaryEmails.map((row) => (
            <SettingsRow
              key={row._id}
              title={
                <span className="flex min-w-0 items-center gap-2">
                  {row.verified ? (
                    <MailCheck className="size-3.5 shrink-0 text-ok" />
                  ) : (
                    <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{row.email}</span>
                </span>
              }
              description={row.verified ? undefined : t("secondaryEmailPending")}
              control={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    setSelected(row);
                    setDialog("remove");
                  }}
                >
                  <Trash2 className="size-3.5" />
                  <span className="sr-only">{t("removeSecondaryEmail")}</span>
                </Button>
              }
            />
          ))
        )}
        <div className="flex items-center justify-between gap-4 px-4 py-3 max-sm:flex-wrap">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            {t("secondaryEmailsFootnote")}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={openAdd}
            disabled={secondaryEmails === null}
          >
            <Plus />
            {t("addSecondaryEmail")}
          </Button>
        </div>
      </SettingsSection>
      {dialogs}
    </div>
  );
}
