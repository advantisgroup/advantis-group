"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { Ban, CheckCircle2, Clock3, Monitor, MonitorSmartphone, Trash2 } from "lucide-react";

import { InfoTip } from "@/components/activity/InfoTip";
import { StatCard } from "@/components/activity/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { useIsAdmin, useIsManager } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { nextSort, type Sort, SortableHead, sortSign } from "@/components/ui/sortable-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRelativeTime, formatTime } from "@/lib/activity/fmt";
import { useI18n } from "@/lib/activity/i18n";
import { useMutationWithToast } from "@/lib/activity/useMutationWithToast";
import { useSlashFocus } from "@/lib/activity/useSlashFocus";

import type { GenericId } from "convex/values";

const DEVICE_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
  active: "success",
  pending: "warning",
  disabled: "destructive",
};

// ── column sorting ───────────────────────────────────────────────────────────

type SortKey = "hostname" | "status" | "lastSeen";
/** Actives first when sorting by status ascending. */
const STATUS_RANK: Record<string, number> = {
  active: 0,
  pending: 1,
  disabled: 2,
};

// ── page ───────────────────────────────────────────────────────────────────

export default function DevicesPage() {
  const { t, lang } = useI18n();
  const isAdmin = useIsAdmin();
  const isManager = useIsManager();
  const devices = useQuery(api.activity.devices.list);
  const people = useQuery(api.activity.people.list);

  const approve = useMutationWithToast(api.activity.devices.approve);
  const disable = useMutationWithToast(api.activity.devices.disable);
  const link = useMutationWithToast(api.activity.devices.link);
  const removeDevice = useMutationWithToast(api.activity.devices.remove);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const searchRef = useSlashFocus<HTMLInputElement>();
  const [sort, setSort] = useState<Sort<SortKey> | null>(null);
  // Per-row pending guard: while a device's mutation is in flight we disable its
  // action buttons so a double-click can't fire two requests.
  const [busyId, setBusyId] = useState<GenericId<"devices"> | null>(null);
  const confirm = useConfirm();

  // Wrap a row mutation so its buttons show a disabled/pending state while it
  // runs; useMutationWithToast already swallows errors and toasts them.
  async function runWithBusy(id: GenericId<"devices">, fn: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await fn();
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete(id: GenericId<"devices">) {
    const ok = await confirm({
      title: t("devices.confirmDelete"),
      description: t("devices.confirmDeleteBody"),
      confirmLabel: t("devices.delete"),
      cancelLabel: t("people.cancel"),
      destructive: true,
    });
    if (ok) {
      await runWithBusy(id, () =>
        removeDevice({ deviceId: id }, { success: t("devices.deleted") }),
      );
    }
  }

  const statusLabel: Record<string, string> = {
    pending: t("status.pending"),
    active: t("status.active"),
    disabled: t("status.disabled"),
  };

  // Filter the table by status and a free-text match on hostname / windows
  // user / linked person, so a larger fleet stays scannable. Then apply the
  // user's column sort (registration order when none is chosen).
  const visibleDevices = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (devices ?? []).filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (!q) return true;
      return [d.hostname, d.lastWindowsUser, d.personName]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q));
    });
    if (!sort) return filtered;
    return filtered.sort((a, b) => {
      const cmp =
        sort.key === "hostname"
          ? a.hostname.localeCompare(b.hostname)
          : sort.key === "status"
            ? (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
            : a.lastSeen - b.lastSeen;
      return cmp * sortSign(sort.dir);
    });
  }, [devices, statusFilter, search, sort]);

  // First click sorts a column its natural way (last seen: newest first);
  // clicking the same column again flips the direction.
  function toggleSort(key: SortKey) {
    setSort((s) => nextSort(s, key, key === "lastSeen" ? "desc" : "asc"));
  }

  const counts = useMemo(() => {
    const list = devices ?? [];
    return {
      total: list.length,
      active: list.filter((d) => d.status === "active").length,
      pending: list.filter((d) => d.status === "pending").length,
      disabled: list.filter((d) => d.status === "disabled").length,
    };
  }, [devices]);

  const header = (
    <PageHeader title={t("devices.heading")} description={t("devices.sub")} icon={<Monitor />} />
  );

  if (devices === undefined || people === undefined) {
    return (
      <section className="space-y-6">
        {header}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  // ── shared row pieces ──────────────────────────────────────────────────
  // The list renders twice — stacked cards on mobile, a table from md up —
  // so the badge, the person-link select and the admin actions live in one
  // place and the two layouts can't drift apart in behaviour.

  const timelineHref = (deviceId: string) => `/activity/timeline/${encodeURIComponent(deviceId)}`;

  const emptyMessage =
    devices.length === 0 ? (
      <>
        {t("devices.empty")}{" "}
        <Link href="/activity/help" className="whitespace-nowrap text-signal hover:underline">
          {t("devices.emptyCta")}
        </Link>
      </>
    ) : (
      t("devices.noMatches")
    );

  const statusBadge = (d: (typeof visibleDevices)[number]) => (
    <InfoTip text={t(`help.deviceStatus.${d.status}`)}>
      <Badge variant={DEVICE_VARIANT[d.status] ?? "muted"}>{statusLabel[d.status]}</Badge>
    </InfoTip>
  );

  const personCell = (d: (typeof visibleDevices)[number]) =>
    isManager ? (
      <Select
        value={d.personId ?? "__none__"}
        onValueChange={(value) =>
          void link(
            {
              deviceId: d._id,
              personId: value === "__none__" ? null : (value as (typeof people)[number]["_id"]),
            },
            { success: t("devices.linked") },
          )
        }
      >
        <SelectTrigger className="min-w-[8rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{t("devices.none")}</SelectItem>
          {people.map((p) => (
            <SelectItem key={p._id} value={p._id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <span className="text-muted-foreground">{d.personName ?? t("devices.none")}</span>
    );

  const adminActions = (d: (typeof visibleDevices)[number]) =>
    isAdmin ? (
      <div className="flex items-center gap-2">
        {d.status !== "active" && (
          <Button
            variant="secondary"
            size="sm"
            className="text-ok"
            disabled={busyId === d._id}
            onClick={() =>
              void runWithBusy(d._id, () =>
                approve({ deviceId: d._id }, { success: t("devices.approved") }),
              )
            }
          >
            {t("devices.approve")}
          </Button>
        )}
        {d.status !== "disabled" && (
          <Button
            variant="secondary"
            size="sm"
            className="text-danger"
            disabled={busyId === d._id}
            onClick={() =>
              void runWithBusy(d._id, () =>
                disable({ deviceId: d._id }, { success: t("devices.disabled") }),
              )
            }
          >
            {t("devices.disable")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          disabled={busyId === d._id}
          onClick={() => void confirmDelete(d._id)}
          className="text-danger hover:bg-danger/10 hover:text-danger"
          aria-label={t("devices.delete")}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    ) : null;

  return (
    <section className="space-y-6">
      {header}

      {/* ── Fleet status summary ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("devices.all")}
          value={counts.total}
          tone="fg"
          hint={counts.total > 0 ? `${counts.active} ${t("status.active")}` : undefined}
          icon={<MonitorSmartphone className="h-4 w-4" />}
        />
        <StatCard
          label={t("status.active")}
          value={counts.active}
          tone="ok"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label={t("status.pending")}
          value={counts.pending}
          tone="warn"
          icon={<Clock3 className="h-4 w-4" />}
        />
        <StatCard
          label={t("status.disabled")}
          value={counts.disabled}
          tone="muted"
          icon={<Ban className="h-4 w-4" />}
        />
      </div>

      {/* ── Devices table ── */}
      <div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <h2 className="font-display text-lg font-bold tracking-tightest text-fg">
            {t("devices.allDevicesHeading")}
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Input
              ref={searchRef}
              placeholder={t("devices.filter.search")}
              aria-label={t("devices.filter.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-48"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("devices.filter.all")}</SelectItem>
                <SelectItem value="active">{t("status.active")}</SelectItem>
                <SelectItem value="pending">{t("status.pending")}</SelectItem>
                <SelectItem value="disabled">{t("status.disabled")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {/* Mobile: one card per device — the table's columns don't fit a
            phone, and horizontal scrolling hides the actions. */}
        <div className="space-y-3 md:hidden">
          {visibleDevices.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </CardContent>
            </Card>
          ) : (
            visibleDevices.map((d) => (
              <Card key={d._id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={timelineHref(d.deviceId)}
                        className="block truncate font-medium text-fg transition-colors hover:text-signal"
                      >
                        {d.hostname}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {d.lastWindowsUser}
                      </p>
                    </div>
                    <span className="shrink-0">{statusBadge(d)}</span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("devices.person")}
                    </p>
                    {personCell(d)}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-soft pt-3">
                    <span className="text-xs text-muted-foreground">
                      {t("devices.lastSeen")}{" "}
                      <span className="font-medium text-fg/80">
                        {formatRelativeTime(d.lastSeen, lang)}
                      </span>
                    </span>
                    {adminActions(d)}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* md and up: the full table. */}
        <Card className="hidden md:block">
          <Table aria-label={t("devices.allDevicesHeading")}>
            <TableHeader>
              <TableRow>
                <SortableHead
                  label={t("devices.host")}
                  active={sort?.key === "hostname"}
                  dir={sort?.dir ?? "asc"}
                  onClick={() => toggleSort("hostname")}
                />
                <TableHead>{t("devices.user")}</TableHead>
                <SortableHead
                  label={t("devices.status")}
                  active={sort?.key === "status"}
                  dir={sort?.dir ?? "asc"}
                  onClick={() => toggleSort("status")}
                />
                <TableHead>{t("devices.person")}</TableHead>
                <SortableHead
                  label={t("devices.lastSeen")}
                  active={sort?.key === "lastSeen"}
                  dir={sort?.dir ?? "asc"}
                  onClick={() => toggleSort("lastSeen")}
                />
                {(isAdmin || isManager) && <TableHead>{t("devices.actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleDevices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                visibleDevices.map((d) => (
                  <TableRow key={d._id}>
                    <TableCell className="font-medium text-fg">
                      <Link
                        href={timelineHref(d.deviceId)}
                        className="text-fg transition-colors hover:text-signal"
                      >
                        {d.hostname}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="text-fg">{d.lastWindowsUser}</span>
                      {d.userHistory && d.userHistory.length > 0 && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {t("devices.formerUsers")}{" "}
                          {d.userHistory
                            .slice()
                            .reverse()
                            .map((h, i) => (
                              <span key={`${h.user}-${h.changedAt}`}>
                                {i > 0 && ", "}
                                <span title={formatTime(h.changedAt, lang)}>{h.user}</span>
                              </span>
                            ))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(d)}</TableCell>
                    <TableCell>{personCell(d)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatRelativeTime(d.lastSeen, lang)}
                    </TableCell>
                    {(isAdmin || isManager) && <TableCell>{adminActions(d)}</TableCell>}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </section>
  );
}
