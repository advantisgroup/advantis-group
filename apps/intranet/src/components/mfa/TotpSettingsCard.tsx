"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@clerk/nextjs";
import { Check, Copy, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

type Enrollment = { secret: string; otpauthUrl: string; qrCodeDataUrl: string };

const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "http://localhost:3002";

async function jsonOrThrow(response: Response) {
  const body = (await response.json()) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? "Request failed");
  return body;
}

export function TotpSettingsCard() {
  const t = useTranslations("Settings");
  const { getToken } = useAuth();
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [dialog, setDialog] = useState<"setup" | "codes" | "remove" | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const apiRequest = useCallback(
    async (path: string, init?: RequestInit): Promise<Response> => {
      const token = await getToken();
      return await fetch(`${apiUrl}${path}`, {
        ...init,
        headers: {
          ...init?.headers,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      });
    },
    [getToken],
  );

  const load = useCallback(async () => {
    try {
      const body = (await jsonOrThrow(await apiRequest("/mfa/totp/status"))) as {
        enrolled: boolean;
      };
      setEnrolled(body.enrolled);
    } catch (error) {
      console.error("[totp] status failed", error);
      toast.error(t("totpLoadError"));
    }
  }, [apiRequest, t]);

  useEffect(() => {
    void load();
  }, [load]);

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
      setEnrolled(true);
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
      await jsonOrThrow(await apiRequest("/mfa/totp", { method: "DELETE" }));
      setEnrolled(false);
      setDialog(null);
      toast.success(t("totpRemoved"));
    } catch (error) {
      console.error("[totp] removal failed", error);
      toast.error(t("totpRemoveError"));
    } finally {
      setBusy(false);
    }
  }

  async function copyRecoveryCodes() {
    if (!recoveryCodes) return;
    await navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
  }

  return (
    <Card id="totp" data-hash-anchor>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-semibold tracking-tight">{t("totp")}</p>
            <p className="text-sm text-muted-foreground">{t("totpHint")}</p>
          </div>
          {enrolled ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full text-destructive hover:text-destructive sm:w-auto"
              onClick={() => setDialog("remove")}
            >
              <Trash2 className="size-3.5" />
              {t("removeTotp")}
            </Button>
          ) : (
            <Button
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => void openSetup()}
              disabled={enrolled === null || busy}
            >
              <Plus className="size-3.5" />
              {t("setUpTotp")}
            </Button>
          )}
        </div>

        {enrolled === null ? (
          <div className="flex justify-center py-3 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : enrolled ? (
          <p className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2.5 text-sm">
            <ShieldCheck className="size-4 shrink-0 text-primary" />
            {t("totpEnabledHint")}
          </p>
        ) : (
          <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
            {t("totpNotEnabled")}
          </p>
        )}

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
      </CardContent>
    </Card>
  );
}
