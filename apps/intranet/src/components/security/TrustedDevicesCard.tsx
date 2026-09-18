"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Monitor, Pencil, ShieldOff } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { useErrorHandler } from "@/hooks/use-error-handler";

type Device = {
  id: Id<"knownDevices">;
  name: string;
  lastSeenAt: number;
  trusted: boolean;
};

/** Same popover-triggered rename UX as `RoleBadge`'s label editor in
 * `UserProfile.tsx` — an inline text swap in the row itself would be a new,
 * one-off pattern; this reuses the one the rest of the app already teaches
 * people. */
function RenameDeviceButton({ device }: { device: Device }) {
  const t = useTranslations("Settings");
  const handleError = useErrorHandler();
  const rename = useMutation(api.stepUp.renameDevice);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(device.name);
  const [saving, setSaving] = useState(false);

  async function save() {
    const name = value.trim();
    if (!name || name === device.name) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await rename({ deviceId: device.id, name });
      setOpen(false);
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(device.name);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground"
          aria-label={t("devices.rename")}
        >
          <Pencil />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="end">
        <p className="text-xs font-medium text-muted-foreground">{t("devices.renameHint")}</p>
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
          placeholder={device.name}
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={saving || !value.trim()} onClick={() => void save()}>
            {saving ? <Loader2 className="animate-spin" /> : t("devices.saveName")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
  const revoke = useMutation(api.stepUp.revokeDeviceTrust);

  const [busyId, setBusyId] = useState<string | null>(null);

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
              }
              description={t("devices.lastSeen", {
                when: format.relativeTime(new Date(device.lastSeenAt)),
              })}
              control={
                <span className="flex items-center gap-1">
                  <RenameDeviceButton device={device} />
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
              }
            />
          ))
        )}
      </SettingsSection>
    </div>
  );
}
