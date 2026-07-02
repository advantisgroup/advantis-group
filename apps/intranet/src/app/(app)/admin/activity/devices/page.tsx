"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  Ban,
  CheckCircle2,
  Clock3,
  Monitor,
  MonitorSmartphone,
  Trash2,
} from "lucide-react";

import { ConfirmDialog } from "@/components/activity/ConfirmDialog";
import { InfoTip } from "@/components/activity/InfoTip";
import { StatCard } from "@/components/activity/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

import type { GenericId } from "convex/values";

const DEVICE_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
  active: "success",
  pending: "warning",
  disabled: "destructive",
};

// ── page ───────────────────────────────────────────────────────────────────

export default function DevicesPage() {
  const { t, lang } = useI18n();
  const me = useQuery(api.users.me);
  const devices = useQuery(api.activity.devices.list);
  const people = useQuery(api.activity.people.list);

  const approve = useMutationWithToast(api.activity.devices.approve);
  const disable = useMutationWithToast(api.activity.devices.disable);
  const link = useMutationWithToast(api.activity.devices.link);
  const removeDevice = useMutationWithToast(api.activity.devices.remove);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  // Per-row pending guard: while a device's mutation is in flight we disable its
  // action buttons so a double-click can't fire two requests.
  const [busyId, setBusyId] = useState<GenericId<"devices"> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GenericId<"devices"> | null>(
    null
  );

  // Wrap a row mutation so its buttons show a disabled/pending state while it
  // runs; useMutationWithToast already swallows errors and toasts them.
  async function runWithBusy(
    id: GenericId<"devices">,
    fn: () => Promise<unknown>
  ) {
    setBusyId(id);
    try {
      await fn();
    } finally {
      setBusyId(null);
    }
  }

  // Intranet role model: admin ⊃ manager ⊃ employee. Admin == ActivityTrack's
  // IT-admin (destructive ops); manager+ may approve/link devices.
  const role = me?.role;
  const isAdmin = role === "admin";
  const isManager = role === "admin" || role === "manager";

  const statusLabel: Record<string, string> = {
    pending: t("status.pending"),
    active: t("status.active"),
    disabled: t("status.disabled"),
  };

  // Filter the table by status and a free-text match on hostname / windows
  // user / linked person, so a larger fleet stays scannable.
  const visibleDevices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (devices ?? []).filter(d => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (!q) return true;
      return [d.hostname, d.lastWindowsUser, d.personName]
        .filter(Boolean)
        .some(s => String(s).toLowerCase().includes(q));
    });
  }, [devices, statusFilter, search]);

  const counts = useMemo(() => {
    const list = devices ?? [];
    return {
      total: list.length,
      active: list.filter(d => d.status === "active").length,
      pending: list.filter(d => d.status === "pending").length,
      disabled: list.filter(d => d.status === "disabled").length,
    };
  }, [devices]);

  const header = (
    <PageHeader
      title={t("devices.heading")}
      description={t("devices.sub")}
      icon={<Monitor />}
    />
  );

  if (devices === undefined || people === undefined) {
    return (
      <section className="space-y-6">
        {header}
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {header}

      {/* ── Fleet status summary ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("devices.all")}
          value={counts.total}
          tone="fg"
          hint={
            counts.total > 0
              ? `${counts.active} ${t("status.active")}`
              : undefined
          }
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
            {t("devices.slots.heading.devices")}
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Input
              placeholder={t("devices.filter.search")}
              aria-label={t("devices.filter.search")}
              value={search}
              onChange={e => setSearch(e.target.value)}
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
        <Card>
          <Table aria-label={t("devices.slots.heading.devices")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("devices.host")}</TableHead>
                <TableHead>{t("devices.user")}</TableHead>
                <TableHead>{t("devices.status")}</TableHead>
                <TableHead>{t("devices.person")}</TableHead>
                <TableHead>{t("devices.lastSeen")}</TableHead>
                {(isAdmin || isManager) && (
                  <TableHead>{t("devices.actions")}</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleDevices.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    {devices.length === 0
                      ? t("devices.empty")
                      : t("devices.noMatches")}
                  </TableCell>
                </TableRow>
              ) : (
                visibleDevices.map(d => (
                  <TableRow key={d._id}>
                    <TableCell className="font-medium text-fg">
                      <Link
                        href={`/admin/activity/timeline/${encodeURIComponent(d.deviceId)}`}
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
                                <span title={formatTime(h.changedAt, lang)}>
                                  {h.user}
                                </span>
                              </span>
                            ))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <InfoTip text={t(`help.deviceStatus.${d.status}`)}>
                        <Badge variant={DEVICE_VARIANT[d.status] ?? "muted"}>
                          {statusLabel[d.status]}
                        </Badge>
                      </InfoTip>
                    </TableCell>
                    <TableCell>
                      {isManager ? (
                        <Select
                          value={d.personId ?? "__none__"}
                          onValueChange={value =>
                            void link(
                              {
                                deviceId: d._id,
                                personId:
                                  value === "__none__"
                                    ? null
                                    : (value as (typeof people)[number]["_id"]),
                              },
                              { success: t("devices.linked") }
                            )
                          }
                        >
                          <SelectTrigger className="min-w-[8rem]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              {t("devices.none")}
                            </SelectItem>
                            {people.map(p => (
                              <SelectItem key={p._id} value={p._id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-muted-foreground">
                          {d.personName ?? t("devices.none")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatRelativeTime(d.lastSeen, lang)}
                    </TableCell>
                    {(isAdmin || isManager) && (
                      <TableCell>
                        {isAdmin && (
                          <div className="flex items-center gap-2">
                            {d.status !== "active" && (
                              <Button
                                variant="secondary"
                                size="sm"
                                className="text-ok"
                                disabled={busyId === d._id}
                                onClick={() =>
                                  void runWithBusy(d._id, () =>
                                    approve(
                                      { deviceId: d._id },
                                      { success: t("devices.approved") }
                                    )
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
                                    disable(
                                      { deviceId: d._id },
                                      { success: t("devices.disabled") }
                                    )
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
                              onClick={() => setDeleteTarget(d._id)}
                              className="text-danger hover:bg-danger/10 hover:text-danger"
                              aria-label={t("devices.delete")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        heading={t("devices.confirmDelete")}
        body={t("devices.confirmDeleteBody")}
        confirmLabel={t("devices.delete")}
        onConfirm={async () => {
          const id = deleteTarget;
          setDeleteTarget(null);
          if (id) {
            await runWithBusy(id, () =>
              removeDevice({ deviceId: id }, { success: t("devices.deleted") })
            );
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
