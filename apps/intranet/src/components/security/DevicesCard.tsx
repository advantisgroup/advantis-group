"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import type { SessionWithActivitiesResource } from "@clerk/types";
import { useMutation, useQuery } from "convex/react";
import { Loader2, LogOut, Monitor, Pencil, Smartphone, Tablet, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { useErrorHandler } from "@/hooks/use-error-handler";

type Session = SessionWithActivitiesResource;

type Device = {
  id: Id<"knownDevices">;
  name: string;
  browser: string | null;
  os: string | null;
  lastSeenAt: number;
  trusted: boolean;
  trustedUntil: number | null;
};

type Row =
  | { kind: "device"; key: string; device: Device; sessions: Session[] }
  | { kind: "session"; key: string; session: Session };

const COLLAPSED_COUNT = 5;

/** Clerk's code for "prove it's you again before doing this" — signing
 * another session out is one of those. */
function needsReverification(error: unknown): boolean {
  const errors = (error as { errors?: Array<{ code?: string }> } | null)?.errors;
  return Array.isArray(errors) && errors.some((e) => e.code === "session_reverification_required");
}

function DeviceIcon({ os, mobile }: { os: string | null; mobile?: boolean }) {
  const Icon =
    os === "iPadOS" ? Tablet : os === "iOS" || os === "Android" || mobile ? Smartphone : Monitor;
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

/**
 * Every browser on this account in one list: its Clerk sessions (where it's
 * signed in) joined to its `knownDevices` row (whether it's trusted), since
 * both describe the same browser. A session with no device row — the account
 * opted out of recognition — still gets a row of its own so it can be signed
 * out.
 */
export function DevicesCard() {
  const t = useTranslations("Settings");
  const format = useFormatter();
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const clerk = useClerk();
  const { user } = useUser();
  const { sessionId: currentSessionId } = useAuth();

  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const devicesResult = useQuery(api.stepUp.trustedDevices);
  const sessionDevices = useQuery(
    api.stepUp.sessionDevices,
    sessions ? { sessionIds: sessions.map((s) => s.id) } : "skip",
  );
  const forgetDevice = useMutation(api.stepUp.revokeDeviceTrust);
  const forgetUntrusted = useMutation(api.stepUp.forgetUntrustedDevices);

  const loadSessions = useCallback(async () => {
    if (!user) return;
    try {
      const list = await user.getSessions();
      setSessions(list.filter((session) => session.status === "active"));
    } catch {
      toast.error(t("sessions.loadError"));
    }
  }, [user, t]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  function promptReverification() {
    toast.error(t("sessions.needsVerification"), {
      action: { label: t("sessions.openSecurity"), onClick: () => clerk.openUserProfile() },
    });
  }

  const devices = devicesResult?.devices;
  const loading = devices === undefined || sessions === null || sessionDevices === undefined;

  const rows: Row[] = [];
  if (!loading) {
    const deviceIdBySession = new Map(sessionDevices.map((s) => [s.sessionId, s.deviceId]));
    const sessionsByDevice = new Map<string, Session[]>();
    for (const session of sessions) {
      const deviceId = deviceIdBySession.get(session.id);
      if (deviceId && devices.some((d) => d.id === deviceId)) {
        sessionsByDevice.set(deviceId, [...(sessionsByDevice.get(deviceId) ?? []), session]);
      } else {
        rows.push({ kind: "session", key: session.id, session });
      }
    }
    for (const device of devices) {
      rows.push({
        kind: "device",
        key: device.id,
        device,
        sessions: sessionsByDevice.get(device.id) ?? [],
      });
    }
    // This browser first, then anywhere still signed in, then the rest.
    const rank = (row: Row) => {
      const rowSessions = row.kind === "device" ? row.sessions : [row.session];
      if (rowSessions.some((s) => s.id === currentSessionId)) return 0;
      return rowSessions.length > 0 ? 1 : 2;
    };
    const lastActive = (row: Row) =>
      row.kind === "session"
        ? row.session.lastActiveAt.getTime()
        : Math.max(row.device.lastSeenAt, ...row.sessions.map((s) => s.lastActiveAt.getTime()));
    rows.sort((a, b) => rank(a) - rank(b) || lastActive(b) - lastActive(a));
  }

  const visible = expanded ? rows : rows.slice(0, COLLAPSED_COUNT);
  const otherSessions = sessions?.filter((s) => s.id !== currentSessionId) ?? [];
  const untrustedCount = devices?.filter((d) => !d.trusted).length ?? 0;

  /** Signs sessions out one at a time — Clerk rate-limits these, and any
   * already signed out should stay that way if a later one fails. Returns
   * false if Clerk wants a fresh verification first. */
  async function signOut(targets: Session[]): Promise<boolean> {
    for (const session of targets) {
      try {
        await session.revoke();
      } catch (error) {
        if (!needsReverification(error)) throw error;
        await loadSessions();
        promptReverification();
        return false;
      }
    }
    await loadSessions();
    return true;
  }

  async function removeDevice(device: Device, deviceSessions: Session[]) {
    const ok = await confirm({
      title: t("devices.removeTitle", { name: device.name }),
      description: t("devices.removeBody"),
      confirmLabel: t("devices.remove"),
      cancelLabel: t("cancel"),
      destructive: true,
    });
    if (!ok) return;
    setBusyKey(device.id);
    try {
      if (!(await signOut(deviceSessions))) return;
      await forgetDevice({ deviceId: device.id });
      toast.success(t("devices.removed"));
    } catch (error) {
      handleError(error);
    } finally {
      setBusyKey(null);
    }
  }

  async function signOutSession(session: Session) {
    const ok = await confirm({
      title: t("sessions.revokeTitle"),
      description: t("sessions.revokeBody"),
      confirmLabel: t("sessions.revokeConfirm"),
      cancelLabel: t("cancel"),
      destructive: true,
    });
    if (!ok) return;
    setBusyKey(session.id);
    try {
      if (await signOut([session])) toast.success(t("sessions.revoked"));
    } catch {
      toast.error(t("sessions.revokeError"));
    } finally {
      setBusyKey(null);
    }
  }

  async function signOutOthers() {
    const ok = await confirm({
      title: t("sessions.revokeAllTitle"),
      description: t("sessions.revokeAllBody", { count: otherSessions.length }),
      confirmLabel: t("sessions.revokeAllConfirm"),
      cancelLabel: t("cancel"),
      destructive: true,
    });
    if (!ok) return;
    setBusyKey("others");
    try {
      if (await signOut(otherSessions)) toast.success(t("sessions.revokedAll"));
    } catch {
      toast.error(t("sessions.revokeError"));
    } finally {
      setBusyKey(null);
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
    setBusyKey("untrusted");
    try {
      const { removed } = await forgetUntrusted({});
      toast.success(t("devices.forgetUntrustedDone", { count: removed }));
    } catch (error) {
      handleError(error);
    } finally {
      setBusyKey(null);
    }
  }

  function place(rowSessions: Session[]): string | null {
    const activity = rowSessions[0]?.latestActivity;
    return [activity?.city, activity?.country].filter(Boolean).join(", ") || null;
  }

  function sessionName(session: Session): string {
    const activity = session.latestActivity;
    return (
      [activity?.browserName, activity?.deviceType].filter(Boolean).join(" · ") ||
      t("sessions.unknownDevice")
    );
  }

  function renderRow(row: Row) {
    const rowSessions = row.kind === "device" ? row.sessions : [row.session];
    const current = rowSessions.some((s) => s.id === currentSessionId);
    const signedIn = rowSessions.length > 0;
    const when =
      row.kind === "session"
        ? row.session.lastActiveAt
        : new Date(
            Math.max(row.device.lastSeenAt, ...row.sessions.map((s) => s.lastActiveAt.getTime())),
          );
    const description = [
      place(rowSessions),
      row.kind === "device" && row.device.trusted && row.device.trustedUntil !== null
        ? t("devices.trustedUntil", {
            date: format.dateTime(new Date(row.device.trustedUntil), {
              day: "numeric",
              month: "short",
            }),
          })
        : null,
      current ? null : t("sessions.lastActive", { when: format.relativeTime(when) }),
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <SettingsRow
        key={row.key}
        title={
          <span className="flex min-w-0 items-center gap-2">
            {row.kind === "device" ? (
              <DeviceIcon os={row.device.os} />
            ) : (
              <DeviceIcon os={null} mobile={row.session.latestActivity?.isMobile} />
            )}
            <span className="truncate">
              {row.kind === "device" ? row.device.name : sessionName(row.session)}
            </span>
            {current ? (
              <span className="shrink-0 text-xs font-normal text-ok">
                {t("sessions.thisDevice")}
              </span>
            ) : (
              signedIn && (
                <span className="shrink-0 text-xs font-normal text-muted-foreground">
                  {t("devices.signedIn")}
                </span>
              )
            )}
          </span>
        }
        description={description || undefined}
        control={
          <div className="flex items-center gap-1">
            {row.kind === "device" && <RenameDeviceButton device={row.device} />}
            {!current && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                aria-label={
                  row.kind === "device" ? t("devices.remove") : t("sessions.revokeConfirm")
                }
                disabled={busyKey !== null}
                onClick={() =>
                  void (row.kind === "device"
                    ? removeDevice(row.device, row.sessions)
                    : signOutSession(row.session))
                }
              >
                {busyKey === row.key ? (
                  <Loader2 className="animate-spin" />
                ) : row.kind === "device" ? (
                  <X />
                ) : (
                  <LogOut />
                )}
              </Button>
            )}
          </div>
        }
      />
    );
  }

  const hiddenCount = rows.length - visible.length;

  return (
    <div id="devices" data-hash-anchor>
      <SettingsSection title={t("devices.title")} description={t("devices.hint")}>
        {loading ? (
          <div className="flex justify-center px-4 py-5 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <SettingsRow
            title={<span className="font-normal text-muted-foreground">{t("devices.empty")}</span>}
          />
        ) : (
          visible.map(renderRow)
        )}
        {!loading && (hiddenCount > 0 || otherSessions.length > 0 || untrustedCount > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            {hiddenCount > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => setExpanded(true)}
              >
                {t("devices.showAll", { count: rows.length })}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap items-center gap-1">
              {untrustedCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  disabled={busyKey !== null}
                  onClick={() => void handleForgetUntrusted()}
                >
                  {busyKey === "untrusted" && <Loader2 className="animate-spin" />}
                  {t("devices.forgetUntrusted", { count: untrustedCount })}
                </Button>
              )}
              {otherSessions.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={busyKey !== null}
                  onClick={() => void signOutOthers()}
                >
                  {busyKey === "others" ? <Loader2 className="animate-spin" /> : <LogOut />}
                  {t("sessions.revokeAll")}
                </Button>
              )}
            </div>
          </div>
        )}
      </SettingsSection>
      {devicesResult?.truncated && expanded && (
        <p className="mt-2 text-xs text-muted-foreground">{t("devices.truncatedNotice")}</p>
      )}
    </div>
  );
}
