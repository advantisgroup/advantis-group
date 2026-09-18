"use client";

import { useState } from "react";

import { Loader2, Mail, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useDestructiveStepUp, type StepUpHintShape } from "@/components/auth/useDestructiveStepUp";
import {
  jsonOrThrow,
  useSecurityState,
  type SecondaryEmail,
} from "@/components/security/security-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useConfirm,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";

export function SecondaryEmailsCard() {
  const t = useTranslations("Settings");
  const confirm = useConfirm();
  const { secondaryEmails, refresh, apiRequest } = useSecurityState();
  const { runGuarded, dialog: stepUpDialog } = useDestructiveStepUp();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setOpen(false);
  }

  function openAdd() {
    setEmail("");
    setCode("");
    setError(null);
    setStep("email");
    setOpen(true);
  }

  function openVerify(row: SecondaryEmail) {
    setEmail(row.email);
    setCode("");
    setError(null);
    setStep("code");
    setOpen(true);
  }

  async function requestCode() {
    setBusy(true);
    setError(null);
    try {
      const result = await runGuarded(
        async () =>
          (await jsonOrThrow(
            await apiRequest("/secondary-emails/request-code", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ email: email.trim() }),
            }),
          )) as { alreadyVerified: boolean } | StepUpHintShape,
      );
      if (!result) return;
      await refresh();
      if (result.alreadyVerified) {
        setOpen(false);
        toast.success(t("secondaryEmailAdded"));
        return;
      }
      setCode("");
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("secondaryEmailAddError"));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(value: string) {
    setBusy(true);
    setError(null);
    try {
      const result = (await jsonOrThrow(
        await apiRequest("/secondary-emails/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: email.trim(), code: value }),
        }),
      )) as { ok: boolean; message?: string };
      if (!result.ok) {
        setError(result.message ?? t("secondaryEmailCodeError"));
        setCode("");
        return;
      }
      await refresh();
      setOpen(false);
      toast.success(t("secondaryEmailAdded"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("secondaryEmailCodeError"));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: SecondaryEmail) {
    const ok = await confirm({
      title: t("removeSecondaryEmailTitle", { email: row.email }),
      description: t("removeSecondaryEmailHint"),
      confirmLabel: t("removeSecondaryEmail"),
      cancelLabel: t("cancel"),
      destructive: true,
    });
    if (!ok) return;
    setRemovingId(row._id);
    try {
      await jsonOrThrow(await apiRequest(`/secondary-emails/${row._id}`, { method: "DELETE" }));
      await refresh();
      toast.success(t("secondaryEmailRemoved"));
    } catch {
      toast.error(t("secondaryEmailRemoveError"));
    } finally {
      setRemovingId(null);
    }
  }

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
                  <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{row.email}</span>
                </span>
              }
              description={row.verified ? t("secondaryEmailVerified") : t("secondaryEmailPending")}
              control={
                <div className="flex items-center gap-1">
                  {!row.verified && (
                    <Button size="sm" variant="ghost" onClick={() => openVerify(row)}>
                      {t("secondaryEmailEnterCode")}
                    </Button>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={removingId !== null}
                    aria-label={t("removeSecondaryEmail")}
                    onClick={() => void remove(row)}
                  >
                    {removingId === row._id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  </Button>
                </div>
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

      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {step === "email" ? t("addSecondaryEmail") : t("secondaryEmailCodeTitle")}
            </DialogTitle>
            <DialogDescription>
              {step === "email"
                ? t("addSecondaryEmailHint")
                : t("secondaryEmailCodeHint", { email: email.trim() })}
            </DialogDescription>
          </DialogHeader>

          {step === "email" ? (
            <form
              id="secondary-email-form"
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim() && !busy) void requestCode();
              }}
            >
              <Label htmlFor="secondary-email">{t("secondaryEmailLabel")}</Label>
              <Input
                id="secondary-email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                aria-invalid={!!error}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
              />
            </form>
          ) : (
            <InputOTP
              maxLength={6}
              value={code}
              disabled={busy}
              autoFocus
              containerClassName="w-full justify-center"
              aria-label={t("secondaryEmailCodeLabel")}
              onChange={(value) => {
                setCode(value);
                setError(null);
                if (value.length === 6) void verifyCode(value);
              }}
            >
              <InputOTPGroup className="flex-1">
                <InputOTPSlot index={0} aria-invalid={!!error} />
                <InputOTPSlot index={1} aria-invalid={!!error} />
                <InputOTPSlot index={2} aria-invalid={!!error} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup className="flex-1">
                <InputOTPSlot index={3} aria-invalid={!!error} />
                <InputOTPSlot index={4} aria-invalid={!!error} />
                <InputOTPSlot index={5} aria-invalid={!!error} />
              </InputOTPGroup>
            </InputOTP>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            {step === "code" ? (
              <Button
                variant="ghost"
                className="text-muted-foreground"
                disabled={busy}
                onClick={() => void requestCode()}
              >
                {t("secondaryEmailResend")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={close} disabled={busy}>
                {t("cancel")}
              </Button>
              {step === "email" && (
                <Button type="submit" form="secondary-email-form" disabled={busy || !email.trim()}>
                  {busy && <Loader2 className="animate-spin" />}
                  {t("secondaryEmailSendCode")}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {stepUpDialog}
    </div>
  );
}
