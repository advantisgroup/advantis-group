"use client";

import { useCallback, useEffect, useState } from "react";

import { startRegistration } from "@simplewebauthn/browser";
import { useAuth } from "@clerk/nextjs";
import { KeyRound, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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

type Passkey = {
  _id: string;
  name: string;
  deviceType: "singleDevice" | "multiDevice";
  backedUp: boolean;
  createdAt: number;
  lastUsedAt: number | null;
};

type RegistrationOptions = Parameters<typeof startRegistration>[0]["optionsJSON"];

const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "http://localhost:3002";

async function jsonOrThrow(response: Response) {
  const body = (await response.json()) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? "Request failed");
  return body;
}

export function PasskeySettingsCard() {
  const t = useTranslations("Settings");
  const { getToken } = useAuth();
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [dialog, setDialog] = useState<"add" | "rename" | "remove" | null>(null);
  const [selected, setSelected] = useState<Passkey | null>(null);
  const [name, setName] = useState("");
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
      const body = (await jsonOrThrow(await apiRequest("/passkeys"))) as { passkeys: Passkey[] };
      setPasskeys(body.passkeys);
    } catch (error) {
      console.error("[passkeys] list failed", error);
      toast.error(t("passkeyLoadError"));
    }
  }, [apiRequest, t]);

  useEffect(() => {
    void load();
  }, [load]);

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
      await load();
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
      await load();
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
      await jsonOrThrow(await apiRequest(`/passkeys/${selected._id}`, { method: "DELETE" }));
      await load();
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

  return (
    <Card id="passkeys" data-hash-anchor>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold tracking-tight">{t("passkeys")}</p>
            <p className="text-sm text-muted-foreground">{t("passkeysHint")}</p>
          </div>
          <Button size="sm" onClick={openAdd} disabled={passkeys === null}>
            <Plus className="size-3.5" />
            {t("addPasskey")}
          </Button>
        </div>

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
            {passkeys.map((passkey) => (
              <div
                key={passkey._id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <KeyRound className="size-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{passkey.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {passkey.lastUsedAt
                        ? t("passkeyLastUsed", {
                            date: new Intl.DateTimeFormat(undefined, {
                              dateStyle: "medium",
                            }).format(passkey.lastUsedAt),
                          })
                        : t("passkeyNotUsed")}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
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
                </div>
              </div>
            ))}
          </div>
        )}

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
      </CardContent>
    </Card>
  );
}
