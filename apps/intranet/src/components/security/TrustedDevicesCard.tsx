"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Monitor, Pencil, Smartphone, Tablet, X } from "lucide-react";
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
  browser: string | null;
  os: string | null;
  lastSeenAt: number;
  trusted: boolean;
  trustedUntil: number | null;
};

const COLLAPSED_COUNT = 5;

function DeviceIcon({ os }: { os: string | null }) {
  const Icon = os === "iOS" || os === "Android" ? Smartphone : os === "iPadOS" ? Tablet : Monitor;
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" />;
}

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
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValue(device.name);
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
      <PopoverContent className="w-64" align="end">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input
            autoFocus
            maxLength={60}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={t("devices.rename")}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={saving || !value.trim()}>
              {saving && <Loader2 className="animate-spin" />}
              {t("devices.saveName")}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function TrustedDevicesCard() {
  const t = useTranslations("Settings");
  const format = useFormatter();
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const result = useQuery(api.stepUp.trustedDevices);
  const revoke = useMutation(api.stepUp.revokeDeviceTrust);
  const forgetUntrusted = useMutation(api.stepUp.forgetUntrustedDevices);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const devices = result?.devices;
  const untrustedCount = devices?.filter((d) => !d.trusted).length ?? 0;
  const visible = expanded ? devices : devices?.slice(0, COLLAPSED_COUNT);
  const hiddenCount = (devices?.length ?? 0) - (visible?.length ?? 0);

  async function handleRevoke(device: Device) {
    const ok = await confirm({
      title: t("devices.revokeTitle"),
      description: t("devices.revokeBody", { name: device.name }),
      confirmLabel: t("devices.revokeConfirm"),
      cancelLabel: t("cancel"),
      destructive: true,
    });
    if (!ok) return;
    setBusyId(device.id);
    try {
      await revoke({ deviceId: device.id });
      toast.success(t("devices.revoked"));
    } catch (error) {
      handleError(error);
    } finally {
      setBusyId(null);
    }
  }

  async function handleForgetUntrusted() {
    const ok = await confirm({
      title: t("devices.forgetUntrustedTitle"),
      description: t("devices.forgetUntrustedBody", { count: untrustedCount }),
      confirmLabel: t("devices.forgetUntrustedConfirm"),
      cancelLabel: t("cancel"),
      destructive: true,
    });
    if (!ok) return;
    setBusyId("untrusted");
    try {
      const { removed } = await forgetUntrusted({});
      toast.success(t("devices.forgetUntrustedDone", { count: removed }));
    } catch (error) {
      handleError(error);
    } finally {
      setBusyId(null);
    }
  }

  function describe(device: Device): string {
    const lastSeen = t("devices.lastSeen", {
      when: format.relativeTime(new Date(device.lastSeenAt)),
    });
    const defaultName = device.browser && device.os ? `${device.browser} on ${device.os}` : null;
    const platform = [device.browser, device.os].filter(Boolean).join(" · ");
    return device.name !== defaultName && platform ? `${platform} · ${lastSeen}` : lastSeen;
  }

  return (
    <div id="devices" data-hash-anchor>
      <SettingsSection title={t("devices.title")} description={t("devices.hint")}>
        {visible === undefined ? (
          <div className="flex justify-center px-4 py-5 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <SettingsRow
            title={<span className="font-normal text-muted-foreground">{t("devices.empty")}</span>}
          />
        ) : (
          visible.map((device) => (
            <SettingsRow
              key={device.id}
              title={
                <span className="flex min-w-0 items-center gap-2">
                  <DeviceIcon os={device.os} />
                  <span className="truncate">{device.name}</span>
                  {device.trusted && device.trustedUntil !== null && (
                    <span className="shrink-0 text-xs font-normal text-ok">
                      {t("devices.trustedUntil", {
                        date: format.dateTime(new Date(device.trustedUntil), {
                          day: "numeric",
                          month: "short",
                        }),
                      })}
                    </span>
                  )}
                </span>
              }
              description={describe(device)}
              control={
                <div className="flex items-center gap-1">
                  <RenameDeviceButton device={device} />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={t("devices.revokeConfirm")}
                    disabled={busyId !== null}
                    onClick={() => void handleRevoke(device)}
                  >
                    {busyId === device.id ? <Loader2 className="animate-spin" /> : <X />}
                  </Button>
                </div>
              }
            />
          ))
        )}
        {(hiddenCount > 0 || untrustedCount > 0) && (
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            {hiddenCount > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => setExpanded(true)}
              >
                {t("devices.showAll", { count: devices?.length ?? 0 })}
              </Button>
            ) : (
              <span />
            )}
            {untrustedCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={busyId !== null}
                onClick={() => void handleForgetUntrusted()}
              >
                {busyId === "untrusted" && <Loader2 className="animate-spin" />}
                {t("devices.forgetUntrusted", { count: untrustedCount })}
              </Button>
            )}
          </div>
        )}
      </SettingsSection>
      {result?.truncated && expanded && (
        <p className="mt-2 text-xs text-muted-foreground">{t("devices.truncatedNotice")}</p>
      )}
    </div>
  );
}
