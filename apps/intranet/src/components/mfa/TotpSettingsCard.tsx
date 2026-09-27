"use client";

import { useState } from "react";

import {
  Check,
  Copy,
  LifeBuoy,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
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
import { Link } from "@/components/Link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { useDestructiveStepUp, type StepUpHintShape } from "@/components/auth/useDestructiveStepUp";
import { jsonOrThrow, useSecurityState } from "@/components/security/security-state";
import { cn } from "@/lib/utils";

type Enrollment = { secret: string; otpauthUrl: string; qrCodeDataUrl: string };

export function TotpSettingsCard() {
  const t = useTranslations("Settings");
  const { totp, refresh, apiRequest } = useSecurityState();
  const enrolled = totp === null ? null : totp.enrolled;
  // Enrolled, but the authenticator behind it is presumed gone — a recovery
  // code was spent. Behaves like "not set up" for the purposes of the buttons
  // so the sign-in gate's re-enrollment step has something to click.
  const needsRotation = totp?.needsRotation === true;
  const recoveryLow = (totp?.recoveryCodesRemaining ?? 0) <= 2;
  const [dialog, setDialog] = useState<"setup" | "codes" | "remove" | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const { runGuarded, dialog: stepUpDialog } = useDestructiveStepUp();

  function closeDialog() {
    if (busy) return;
    setDialog(null);
    setEnrollment(null);
    setRecoveryCodes(null);
    setCopied(false);
  }

  async function openSetup() {
    setBusy(true);
    try {
      const body = (await jsonOrThrow(
        await apiRequest("/mfa/totp/enroll", { method: "POST" }),
      )) as Enrollment;
      setEnrollment(body);
      setCode("");
      setDialog("setup");
    } catch (error) {
      console.error("[totp] enroll start failed", error);
      toast.error(t("totpEnrollError"));
    } finally {
      setBusy(false);
    }
  }

  async function verifySetup() {
    setBusy(true);
    try {
      const body = (await jsonOrThrow(
        await apiRequest("/mfa/totp/enroll/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code }),
        }),
      )) as { recoveryCodes: string[] };
      setRecoveryCodes(body.recoveryCodes);
      setDialog("codes");
      await refresh();
      toast.success(t("totpEnabled"));
    } catch (error) {
      console.error("[totp] enroll verify failed", error);
      toast.error(t("totpCodeError"));
    } finally {
      setBusy(false);
    }
  }

  async function removeTotp() {
    setBusy(true);
    try {
      // The server hands back a step-up hint instead of removing anything
      // when this session hasn't verified recently enough; `runGuarded` puts
      // the dialog in front of it and returns null if the user backs out.
      const result = await runGuarded(
        async () =>
          (await jsonOrThrow(await apiRequest("/mfa/totp", { method: "DELETE" }))) as
            | { ok: true }
            | StepUpHintShape,
      );
      if (!result) return;
      await refresh();
      setDialog(null);
      toast.success(t("totpRemoved"));
    } catch (error) {
      console.error("[totp] removal failed", error);
      toast.error(t("totpRemoveError"));
    } finally {
      setBusy(false);
    }
  }

  async function regenerateCodes() {
    setBusy(true);
    try {
      // Gated exactly like a removal — fresh codes void whatever the user
      // wrote down, so it needs the same proof of presence.
      const result = await runGuarded(
        async () =>
          (await jsonOrThrow(await apiRequest("/mfa/totp/recovery-codes", { method: "POST" }))) as
            | { recoveryCodes: string[] }
            | StepUpHintShape,
      );
      if (!result) return;
      setRecoveryCodes(result.recoveryCodes);
      setCopied(false);
      setDialog("codes");
      await refresh();
    } catch (error) {
      console.error("[totp] recovery code regeneration failed", error);
      toast.error(t("recoveryCodesError"));
    } finally {
      setBusy(false);
    }
  }

  async function copyRecoveryCodes() {
    if (!recoveryCodes) return;
    await navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
  }

  const helpLinks = (
    <>
      {t("totpHelpIntro")}{" "}
      <a
        href="https://support.microsoft.com/en-us/authenticator/download-microsoft-authenticator"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline underline-offset-2 hover:opacity-80 text-foreground decoration-muted-foreground/50"
      >
        {t("totpHelpDownload")}
      </a>{" "}
      ·{" "}
      <Link
        href="/guidebooks/sicherheitsanmeldung"
        className="font-medium underline underline-offset-2 hover:opacity-80 text-foreground decoration-muted-foreground/50"
      >
        {t("totpHelpGuide")}
      </Link>
    </>
  );

  const recoveryLabel = t("recoveryCodesRemaining", {
    remaining: totp?.recoveryCodesRemaining ?? 0,
    total: totp?.recoveryCodesTotal ?? 0,
  });

  const dialogs = (
    <>
      <Dialog open={dialog === "setup"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("setUpTotp")}</DialogTitle>
            <DialogDescription>{t("setUpTotpHint")}</DialogDescription>
          </DialogHeader>
          {enrollment && (
            <div className="space-y-3">
              <div className="flex justify-center">
                {/* data URL from our own API — next/image can't optimize it, and doesn't need to */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={enrollment.qrCodeDataUrl}
                  alt={t("totpQrAlt")}
                  className="size-44 rounded-lg border border-border/70 bg-white p-2"
                />
              </div>
              <div className="space-y-1">
                <Label>{t("totpManualEntry")}</Label>
                <p className="break-all rounded-lg border border-border/70 bg-muted/40 px-3 py-2 font-mono text-xs">
                  {enrollment.secret}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="totp-code">{t("totpCode")}</Label>
                <Input
                  id="totp-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button disabled={busy || code.length !== 6} onClick={() => void verifySetup()}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t("verifyTotp")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "codes"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("totpRecoveryCodesTitle")}</DialogTitle>
            <DialogDescription>{t("totpRecoveryCodesHint")}</DialogDescription>
          </DialogHeader>
          {recoveryCodes && (
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-muted/40 p-3 font-mono text-sm">
              {recoveryCodes.map((recoveryCode) => (
                <span key={recoveryCode}>{recoveryCode}</span>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => void copyRecoveryCodes()}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? t("copied") : t("copyRecoveryCodes")}
            </Button>
            <Button onClick={closeDialog}>{t("totpRecoveryCodesDone")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "remove"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("removeTotp")}</DialogTitle>
            <DialogDescription>{t("removeTotpHint")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void removeTotp()}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t("removeTotp")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {stepUpDialog}
    </>
  );

  return (
    <div id="totp" data-hash-anchor>
      <SettingsSection title={t("totp")} description={t("totpHint")}>
        {enrolled === null ? (
          <div className="flex justify-center px-4 py-5 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : needsRotation ? (
          <SettingsRow
            title={
              <span className="flex items-start gap-2 font-normal">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" />
                {t("totpNeedsRotation")}
              </span>
            }
            control={
              <Button size="sm" onClick={() => void openSetup()} disabled={busy}>
                <Plus />
                {t("replaceTotp")}
              </Button>
            }
          />
        ) : enrolled ? (
          <>
            <SettingsRow
              title={
                <span className="flex items-center gap-2">
                  <ShieldCheck className="size-4 shrink-0 text-ok" />
                  {t("totpEnabledHint")}
                </span>
              }
              control={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDialog("remove")}
                >
                  <Trash2 className="size-3.5" />
                  <span className="sr-only">{t("removeTotp")}</span>
                </Button>
              }
            />
            <SettingsRow
              title={
                <span className="flex items-center gap-2">
                  <LifeBuoy
                    className={cn(
                      "size-4 shrink-0",
                      recoveryLow ? "text-warn" : "text-muted-foreground",
                    )}
                  />
                  {recoveryLabel}
                </span>
              }
              description={recoveryLow ? t("recoveryCodesLowHint") : undefined}
              control={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void regenerateCodes()}
                >
                  <RefreshCw />
                  {t("regenerateRecoveryCodes")}
                </Button>
              }
            />
          </>
        ) : (
          <SettingsRow
            title={<span className="font-normal text-muted-foreground">{t("totpNotEnabled")}</span>}
            control={
              <Button size="sm" onClick={() => void openSetup()} disabled={busy}>
                <Plus />
                {t("setUpTotp")}
              </Button>
            }
          />
        )}
        <p className="px-4 py-3 text-xs text-muted-foreground">{helpLinks}</p>
      </SettingsSection>
      {dialogs}
    </div>
  );
}
