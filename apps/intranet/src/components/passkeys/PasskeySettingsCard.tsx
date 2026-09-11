"use client";

import { useState } from "react";

import { startRegistration } from "@simplewebauthn/browser";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CloudCheck, KeyRound, Loader2, Pencil, Plus, Smartphone, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { MOTION } from "@/components/activity/motion/motion-tokens";
import { Badge } from "@/components/ui/badge";
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
import { Link } from "@/components/Link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { jsonOrThrow, useSecurityState, type Passkey } from "@/components/security/security-state";
import { useDestructiveStepUp, type StepUpHintShape } from "@/components/auth/useDestructiveStepUp";
import { useDesignPreview } from "@/lib/design-preview";
import { signalAcceptedPasskeys } from "./passkey-signal";

type RegistrationOptions = Parameters<typeof startRegistration>[0]["optionsJSON"];

type AcceptedCredentialsSignal = {
  rpId: string;
  userId: string;
  allAcceptedCredentialIds: string[];
};

export function PasskeySettingsCard() {
  const t = useTranslations("Settings");
  const format = useFormatter();
  const prefersReducedMotion = useReducedMotion();
  const refreshed = useDesignPreview() === "refreshed";
  const { passkeys, refresh, apiRequest } = useSecurityState();
  const [dialog, setDialog] = useState<"add" | "rename" | "remove" | null>(null);
  const [selected, setSelected] = useState<Passkey | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const { runGuarded, dialog: stepUpDialog } = useDestructiveStepUp();

  function openAdd() {
    setName(t("passkeyDefaultName"));
    setSelected(null);
    setDialog("add");
  }

  function openRename(passkey: Passkey) {
    setSelected(passkey);
    setName(passkey.name);
    setDialog("rename");
  }

  async function addPasskey() {
    setBusy(true);
    try {
      const { options, flowId } = (await jsonOrThrow(
        await apiRequest("/passkeys/registration/options", { method: "POST" }),
      )) as { options: RegistrationOptions; flowId: string };
      const response = await startRegistration({ optionsJSON: options });
      await jsonOrThrow(
        await apiRequest("/passkeys/registration/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ flowId, name, response }),
        }),
      );
      await refresh();
      setDialog(null);
      toast.success(t("passkeyAdded"));
    } catch (error) {
      console.error("[passkeys] registration failed", error);
      toast.error(t("passkeyAddError"));
    } finally {
      setBusy(false);
    }
  }

  async function renamePasskey() {
    if (!selected) return;
    setBusy(true);
    try {
      await jsonOrThrow(
        await apiRequest(`/passkeys/${selected._id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        }),
      );
      await refresh();
      setDialog(null);
      toast.success(t("passkeyRenamed"));
    } catch (error) {
      console.error("[passkeys] rename failed", error);
      toast.error(t("passkeyRenameError"));
    } finally {
      setBusy(false);
    }
  }

  async function removeSelectedPasskey() {
    if (!selected) return;
    setBusy(true);
    try {
      // Removal is gated server-side — see `destructiveRequirement`. A hint
      // comes back instead of a deletion when this session needs to prove
      // itself first; `runGuarded` handles that round trip.
      const result = await runGuarded(
        async () =>
          (await jsonOrThrow(
            await apiRequest(`/passkeys/${selected._id}`, { method: "DELETE" }),
          )) as { ok: true; signal?: AcceptedCredentialsSignal } | StepUpHintShape,
      );
      if (!result) return;
      if (result.signal) {
        try {
          await signalAcceptedPasskeys(result.signal);
        } catch (error) {
          console.warn("[passkeys] credential cleanup signal failed", error);
        }
      }
      await refresh();
      setDialog(null);
      toast.success(t("passkeyRemoved"));
    } catch (error) {
      console.error("[passkeys] removal failed", error);
      toast.error(t("passkeyRemoveError"));
    } finally {
      setBusy(false);
    }
  }

  const dialogTitle =
    dialog === "add"
      ? t("addPasskey")
      : dialog === "rename"
        ? t("renamePasskey")
        : t("removePasskey");

  const isSynced = (passkey: Passkey) => passkey.backedUp || passkey.deviceType === "multiDevice";

  const lastUsed = (passkey: Passkey) =>
    passkey.lastUsedAt
      ? t("passkeyLastUsed", {
          date: format.dateTime(new Date(passkey.lastUsedAt), { dateStyle: "medium" }),
        })
      : t("passkeyNotUsed");

  const helpLinks = (
    <>
      {t("passkeyHelpIntro")}{" "}
      <a
        href="https://support.microsoft.com/en-us/windows/learn-about-windows-hello-and-set-it-up-dae28983-8242-bb2a-d3d1-87c9d265a5f0"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
      >
        {t("passkeyHelpWindows")}
      </a>{" "}
      ·{" "}
      <a
        href="https://support.apple.com/guide/iphone/use-passkeys-to-sign-in-to-websites-and-apps-iphf538ea8d0/ios"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
      >
        {t("passkeyHelpIphone")}
      </a>{" "}
      ·{" "}
      <Link
        href="/guidebooks/sicherheitsanmeldung"
        className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
      >
        {t("passkeyHelpGuide")}
      </Link>
    </>
  );

  const rowActions = (passkey: Passkey) => (
    <>
      <Button size="icon-sm" variant="ghost" onClick={() => openRename(passkey)}>
        <Pencil className="size-3.5" />
        <span className="sr-only">{t("renamePasskey")}</span>
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={() => {
          setSelected(passkey);
          setDialog("remove");
        }}
      >
        <Trash2 className="size-3.5" />
        <span className="sr-only">{t("removePasskey")}</span>
      </Button>
    </>
  );

  const dialogs = (
    <>
      <Dialog open={dialog !== null} onOpenChange={(open) => !open && !busy && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              {dialog === "add"
                ? t("addPasskeyHint")
                : dialog === "rename"
                  ? t("renamePasskeyHint")
                  : t("removePasskeyHint")}
            </DialogDescription>
          </DialogHeader>
          {dialog !== "remove" && (
            <div className="space-y-2">
              <Label htmlFor="passkey-name">{t("passkeyName")}</Label>
              <Input
                id="passkey-name"
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button
              variant={dialog === "remove" ? "destructive" : "default"}
              disabled={busy || (dialog !== "remove" && !name.trim())}
              onClick={() => {
                if (dialog === "add") void addPasskey();
                if (dialog === "rename") void renamePasskey();
                if (dialog === "remove") void removeSelectedPasskey();
              }}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {dialog === "add"
                ? t("addPasskey")
                : dialog === "rename"
                  ? t("savePasskey")
                  : t("removePasskey")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {stepUpDialog}
    </>
  );

  if (refreshed) {
    return (
      <div id="passkeys" data-hash-anchor>
        <SettingsSection title={t("passkeys")} description={t("passkeysHint")}>
          {passkeys === null ? (
            <div className="flex justify-center px-4 py-5 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : passkeys.length === 0 ? (
            <SettingsRow
              title={<span className="font-normal text-muted-foreground">{t("noPasskeys")}</span>}
            />
          ) : (
            passkeys.map((passkey) => (
              <SettingsRow
                key={passkey._id}
                title={
                  <span className="flex min-w-0 items-center gap-2">
                    <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{passkey.name}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-normal text-muted-foreground">
                      {isSynced(passkey) ? (
                        <CloudCheck className="size-3" />
                      ) : (
                        <Smartphone className="size-3" />
                      )}
                      {isSynced(passkey) ? t("passkeySynced") : t("passkeyDeviceBound")}
                    </span>
                  </span>
                }
                description={lastUsed(passkey)}
                control={<div className="flex gap-1">{rowActions(passkey)}</div>}
              />
            ))
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-xs text-muted-foreground">{helpLinks}</p>
            <Button size="sm" variant="outline" onClick={openAdd} disabled={passkeys === null}>
              <Plus />
              {t("addPasskey")}
            </Button>
          </div>
        </SettingsSection>
        {dialogs}
      </div>
    );
  }

  return (
    <Card id="passkeys" data-hash-anchor>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-semibold tracking-tight">{t("passkeys")}</p>
            <p className="text-sm text-muted-foreground">{t("passkeysHint")}</p>
          </div>
          <Button
            size="sm"
            className="w-full sm:w-auto"
            onClick={openAdd}
            disabled={passkeys === null}
          >
            <Plus className="size-3.5" />
            {t("addPasskey")}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">{helpLinks}</p>

        {passkeys === null ? (
          <div className="flex justify-center py-3 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : passkeys.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
            {t("noPasskeys")}
          </p>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {passkeys.map((passkey) => (
                <motion.div
                  key={passkey._id}
                  layout={!prefersReducedMotion}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: MOTION.base, ease: MOTION.ease }}
                  className="flex items-center justify-between gap-3 overflow-hidden rounded-lg border border-border/70 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <KeyRound className="size-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-sm font-medium">{passkey.name}</p>
                        {/* Whether losing this device loses the key is the one
                            thing a passkey list has to say, and the data was
                            already stored — just never rendered. */}
                        <Badge variant="muted" className="gap-1 text-[10px]">
                          {isSynced(passkey) ? (
                            <>
                              <CloudCheck className="size-3" />
                              {t("passkeySynced")}
                            </>
                          ) : (
                            <>
                              <Smartphone className="size-3" />
                              {t("passkeyDeviceBound")}
                            </>
                          )}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{lastUsed(passkey)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">{rowActions(passkey)}</div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {dialogs}
      </CardContent>
    </Card>
  );
}
