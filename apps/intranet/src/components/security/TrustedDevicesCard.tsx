"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Monitor, Pencil, Search, ShieldOff, Smartphone, Tablet } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { FilterPill } from "@/components/ui/filter-pill";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SettingsSection } from "@/components/ui/settings-rows";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorHandler } from "@/hooks/use-error-handler";

type Device = {
  id: Id<"knownDevices">;
  name: string;
  browser: string | null;
  os: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
  trusted: boolean;
  trustedUntil: number | null;
};

function DeviceIcon({ os }: { os: string | null }) {
  const Icon = os === "iOS" || os === "Android" ? Smartphone : os === "iPadOS" ? Tablet : Monitor;
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" />;
}

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

type StatusFilter = "trusted" | "not_trusted";

/**
 * Phase 7 of docs/future-features/21_auth-consolidation.md: the user-facing
 * side of `knownDevices` — a device recognized from a step-up is now a
 * named, revocable record instead of a purely backend recognition hash.
 * Revoking forgets the device outright (see `revokeDeviceTrust`'s doc
 * comment) rather than merely marking it untrusted, so the next visit from
 * it looks genuinely new again.
 *
 * A real `Table` with search/filter, not a bare row list: an account that's
 * signed in from a handful of browsers over the years accumulates a device
 * per (rough location, browser, OS) combination it's used, and a flat list
 * with no way to search or tell them apart stops being useful well before
 * it gets that long. `Search`/`FilterPill` match the same pattern the
 * directory's own person list already uses.
 */
export function TrustedDevicesCard() {
  const t = useTranslations("Settings");
  const format = useFormatter();
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const result = useQuery(api.stepUp.trustedDevices);
  const revoke = useMutation(api.stepUp.revokeDeviceTrust);
  const forgetUntrusted = useMutation(api.stepUp.forgetUntrustedDevices);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [forgetting, setForgetting] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter[]>([]);

  const devices = result?.devices;
  const untrustedCount = useMemo(() => devices?.filter((d) => !d.trusted).length ?? 0, [devices]);

  const filtered = useMemo(() => {
    if (!devices) return [];
    const query = search.trim().toLowerCase();
    return devices.filter((d) => {
      if (statusFilter.length > 0) {
        const matchesStatus = statusFilter.includes(d.trusted ? "trusted" : "not_trusted");
        if (!matchesStatus) return false;
      }
      if (!query) return true;
      return [d.name, d.browser, d.os].some((field) => field?.toLowerCase().includes(query));
    });
  }, [devices, search, statusFilter]);

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

  async function handleForgetUntrusted() {
    const ok = await confirm({
      title: t("devices.forgetUntrustedTitle"),
      description: t("devices.forgetUntrustedBody", { count: untrustedCount }),
      confirmLabel: t("devices.forgetUntrustedConfirm"),
      cancelLabel: t("cancel"),
      destructive: true,
    });
    if (!ok) return;
    setForgetting(true);
    try {
      const { removed } = await forgetUntrusted({});
      toast.success(t("devices.forgetUntrustedDone", { count: removed }));
    } catch (error) {
      handleError(error);
    } finally {
      setForgetting(false);
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
          <div className="space-y-3 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="relative w-full sm:w-56">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={t("devices.searchPlaceholder")}
                    aria-label={t("devices.searchPlaceholder")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 pl-8 text-[13px]"
                  />
                </div>
                <FilterPill
                  label={t("devices.filterStatus")}
                  options={[
                    { value: "trusted", label: t("devices.trusted") },
                    { value: "not_trusted", label: t("devices.notTrusted") },
                  ]}
                  selected={statusFilter}
                  onChange={(next) => setStatusFilter(next as StatusFilter[])}
                  clearLabel={t("devices.clearFilter")}
                />
              </div>
              {untrustedCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={forgetting}
                  onClick={() => void handleForgetUntrusted()}
                  className="shrink-0"
                >
                  {forgetting ? <Loader2 className="animate-spin" /> : <ShieldOff />}
                  {t("devices.forgetUntrusted", { count: untrustedCount })}
                </Button>
              )}
            </div>

            {result?.truncated && (
              <p className="text-xs text-muted-foreground">{t("devices.truncatedNotice")}</p>
            )}

            {filtered.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                {t("devices.noMatches")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("devices.columnDevice")}</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      {t("devices.columnBrowser")}
                    </TableHead>
                    <TableHead className="hidden md:table-cell">{t("devices.columnOs")}</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      {t("devices.columnLastSeen")}
                    </TableHead>
                    <TableHead>{t("devices.columnStatus")}</TableHead>
                    <TableHead className="text-right">{t("devices.columnActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((device) => (
                    <TableRow key={device.id}>
                      <TableCell className="py-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <DeviceIcon os={device.os} />
                          <span className="truncate">{device.name}</span>
                        </span>
                      </TableCell>
                      <TableCell className="hidden py-2 text-sm text-muted-foreground sm:table-cell">
                        {device.browser ?? "—"}
                      </TableCell>
                      <TableCell className="hidden py-2 text-sm text-muted-foreground md:table-cell">
                        {device.os ?? "—"}
                      </TableCell>
                      <TableCell className="hidden py-2 text-sm text-muted-foreground sm:table-cell">
                        {format.relativeTime(new Date(device.lastSeenAt))}
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge
                          variant={device.trusted ? "success" : "muted"}
                          className="text-[10px]"
                        >
                          {device.trusted ? t("devices.trusted") : t("devices.notTrusted")}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <span className="inline-flex items-center gap-1">
                          <RenameDeviceButton device={device} />
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={t("devices.revokeConfirm")}
                            disabled={busyId !== null}
                            onClick={() => void handleRevoke(device.id, device.name)}
                          >
                            {busyId === device.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <ShieldOff />
                            )}
                          </Button>
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
