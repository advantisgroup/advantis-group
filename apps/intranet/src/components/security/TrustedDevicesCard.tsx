"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Check, Loader2, Monitor, Pencil, ShieldOff, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { useErrorHandler } from "@/hooks/use-error-handler";

/**
 * Phase 7 of docs/future-features/21_auth-consolidation.md: the user-facing
 * side of `knownDevices` — a device recognized from a step-up is now a
 * named, revocable record instead of a purely backend recognition hash.
 * Revoking forgets the device outright (see `revokeDeviceTrust`'s doc
 * comment) rather than merely marking it untrusted, so the next visit from
 * it looks genuinely new again.
 */
export function TrustedDevicesCard() {
  const t = useTranslations("Settings");
  const format = useFormatter();
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const devices = useQuery(api.stepUp.trustedDevices);
  const rename = useMutation(api.stepUp.renameDevice);
  const revoke = useMutation(api.stepUp.revokeDeviceTrust);

  const [editingId, setEditingId] = useState<Id<"knownDevices"> | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  function startEdit(id: Id<"knownDevices">, currentName: string) {
    setEditingId(id);
    setEditValue(currentName);
  }

  async function saveEdit(id: Id<"knownDevices">) {
    const name = editValue.trim();
    if (!name) {
      setEditingId(null);
      return;
    }
    setBusyId(id);
    try {
      await rename({ deviceId: id, name });
      setEditingId(null);
    } catch (error) {
      handleError(error);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevoke(id: Id<"knownDevices">, name: string) {
    const ok = await confirm({
      title: t("devices.revokeTitle"),
      description: t("devices.revokeBody", { name }),
      confirmLabel: t("devices.revokeConfirm"),
      cancelLabel: t("cancel"),
      destructive: true,
    });
    if (!ok) return;
    setBusyId(id);
    try {
      await revoke({ deviceId: id });
      toast.success(t("devices.revoked"));
    } catch (error) {
      handleError(error);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div id="devices" data-hash-anchor>
      <SettingsSection title={t("devices.title")} description={t("devices.hint")}>
        {devices === undefined ? (
          <div className="flex justify-center px-4 py-5 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : devices.length === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-muted-foreground">
            {t("devices.empty")}
          </p>
        ) : (
          devices.map((device) => (
            <SettingsRow
              key={device.id}
              title={
                editingId === device.id ? (
                  <span className="flex items-center gap-1.5">
                    <Input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveEdit(device.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="h-8 max-w-48"
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("devices.saveName")}
                      onClick={() => void saveEdit(device.id)}
                    >
                      <Check />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("cancel")}
                      onClick={() => setEditingId(null)}
                    >
                      <X />
                    </Button>
                  </span>
                ) : (
                  <span className="flex min-w-0 items-center gap-2">
                    <Monitor className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{device.name}</span>
                    {device.trusted ? (
                      <span className="shrink-0 text-xs font-normal text-ok">
                        {t("devices.trusted")}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs font-normal text-muted-foreground">
                        {t("devices.notTrusted")}
                      </span>
                    )}
                  </span>
                )
              }
              description={t("devices.lastSeen", {
                when: format.relativeTime(new Date(device.lastSeenAt)),
              })}
              control={
                editingId === device.id ? null : (
                  <span className="flex items-center gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      aria-label={t("devices.rename")}
                      disabled={busyId !== null}
                      onClick={() => startEdit(device.id, device.name)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={t("devices.revokeConfirm")}
                      disabled={busyId !== null}
                      onClick={() => void handleRevoke(device.id, device.name)}
                    >
                      {busyId === device.id ? <Loader2 className="animate-spin" /> : <ShieldOff />}
                    </Button>
                  </span>
                )
              }
            />
          ))
        )}
      </SettingsSection>
    </div>
  );
}
