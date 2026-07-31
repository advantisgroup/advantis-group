"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useAction, useQuery } from "convex/react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Mark } from "@/components/branding/ProviderMark";
import { TrademarkNotice } from "@/components/branding/TrademarkNotice";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useSlashFocus } from "@/lib/activity/useSlashFocus";
import { cn } from "@/lib/utils";

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
type Weekday = (typeof WEEKDAYS)[number];
type WeekHours = Record<Weekday, number>;
const EMPTY_WEEK: WeekHours = {
  monday: 0,
  tuesday: 0,
  wednesday: 0,
  thursday: 0,
  friday: 0,
  saturday: 0,
  sunday: 0,
};

interface ClockodoUser {
  id: number;
  name: string;
  email: string;
  active?: boolean;
  startDate: string | null;
  exitDate: string | null;
  boss: number | null;
}

interface ClockodoRow extends ClockodoUser {
  weeklyHours: number | null;
  vacationDaysPerYear: number | null;
  linkedUserId: string | null;
  linkedUserName: string | null;
  deviceId: string | null;
}

type SortKey = "name" | "weeklyHours" | "vacationDaysPerYear";
type LiveStatus = "working" | "break" | "clockedOut" | null;

const STATUS_DOT: Record<NonNullable<LiveStatus>, string> = {
  working: "bg-emerald-500",
  break: "bg-amber-500",
  clockedOut: "bg-muted-foreground/40",
};

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** Sortable column header — click to sort, click again to flip direction. */
function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1 hover:text-fg"
      >
        {label}
        {active &&
          (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </TableHead>
  );
}

/** Bulk-set the same weekly target-hours period for every selected employee. */
function BulkHoursDialog({
  open,
  onOpenChange,
  count,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onSave: (days: WeekHours) => Promise<void>;
}) {
  const t = useTranslations("Integrations");
  const [days, setDays] = useState<WeekHours>(EMPTY_WEEK);
  const [saving, setSaving] = useState(false);
  const total = WEEKDAYS.reduce((sum, day) => sum + (days[day] || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("bulkSetHours", { count })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
            {WEEKDAYS.map((day) => (
              <div key={day}>
                <label className="block text-center text-[10px] text-muted-foreground">
                  {t(day)}
                </label>
                <Input
                  type="number"
                  value={days[day]}
                  onChange={(e) => setDays((d) => ({ ...d, [day]: Number(e.target.value) || 0 }))}
                  className="h-8 px-1 text-center text-xs"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("weeklyTotal")}: <strong className="text-fg">{total}h</strong>
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onSave(days);
              setSaving(false);
              onOpenChange(false);
            }}
          >
            {t("apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Bulk-set the same vacation-days entitlement for every selected employee. */
function BulkVacationDialog({
  open,
  onOpenChange,
  count,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onSave: (days: number) => Promise<void>;
}) {
  const t = useTranslations("Integrations");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const parsed = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(parsed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("bulkSetVacation", { count })}</DialogTitle>
        </DialogHeader>
        <Input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("vacationDaysPerYear")}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            disabled={!valid || saving}
            onClick={async () => {
              setSaving(true);
              await onSave(parsed);
              setSaving(false);
              onOpenChange(false);
              setValue("");
            }}
          >
            {t("apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ClockodoAdminPanel() {
  const t = useTranslations("Integrations");
  const router = useRouter();
  const handleError = useErrorHandler();

  const listClockodoUsers = useAction(api.integrations.clockodo.users.listClockodoUsers);
  const getClockodoUserDetail = useAction(api.integrations.clockodo.users.getClockodoUserDetail);
  const createClockodoUser = useAction(api.integrations.clockodo.users.createClockodoUser);
  const setTargetHours = useAction(api.integrations.clockodo.users.setTargetHours);
  const setVacationEntitlement = useAction(api.integrations.clockodo.users.setVacationEntitlement);
  const getClockodoRosterHours = useAction(api.integrations.clockodo.users.getClockodoRosterHours);

  const links = useQuery(api.integrations.clockodoView.listWithLinks);

  const [rows, setRows] = useState<ClockodoRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [vacationDaysPerYear, setVacationDaysPerYear] = useState("");

  const [search, setSearch] = useState("");
  const searchRef = useSlashFocus<HTMLInputElement>();
  const [filterUnlinked, setFilterUnlinked] = useState(false);
  const [filterMissingHours, setFilterMissingHours] = useState(false);
  const [filterMissingVacation, setFilterMissingVacation] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "name",
    dir: 1,
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkHoursOpen, setBulkHoursOpen] = useState(false);
  const [bulkVacationOpen, setBulkVacationOpen] = useState(false);
  const [hoursByUserId, setHoursByUserId] = useState<Map<number, number>>(new Map());

  const load = useCallback(async () => {
    try {
      const users = await listClockodoUsers({});
      const details = await Promise.all(
        users.map((u) =>
          getClockodoUserDetail({ clockodoUserId: u.id }).catch((err) => {
            console.error(`[clockodo] detail fetch failed for user ${u.id}:`, err);
            return { user: u, targetHours: [], holidaysQuota: [] };
          }),
        ),
      );
      setRows(
        users.map((u, i) => {
          const detail = details[i];
          const latestTargetHours = detail.targetHours.at(-1) ?? null;
          const latestHolidaysQuota = detail.holidaysQuota.at(-1) ?? null;
          return {
            ...u,
            weeklyHours: latestTargetHours?.weeklyTotal ?? null,
            vacationDaysPerYear: latestHolidaysQuota?.daysPerYear ?? null,
            linkedUserId: null,
            linkedUserName: null,
            deviceId: null,
          };
        }),
      );
      setLoadError(false);
    } catch (err) {
      console.error(err);
      setLoadError(true);
    }
  }, [listClockodoUsers, getClockodoUserDetail]);

  useEffect(() => {
    void load();
  }, [load]);

  const merged = (rows ?? []).map((row) => {
    const link = links?.find((l) => l.clockodoUserId === String(row.id));
    return {
      ...row,
      linkedUserId: link?.userId ?? null,
      linkedUserName: link?.name ?? null,
      deviceId: link?.deviceId ?? null,
    };
  });

  // Live "who's clocked in" — cheap, reads the ActivityTrack poll cache
  // rather than hitting Clockodo. "Hours this week" below is the one
  // column that needs a live per-user Clockodo call, so it's fetched
  // separately and shows a loading dash until it resolves.
  const clockodoUserIds = useMemo(() => merged.map((r) => r.id), [merged]);
  const liveStatuses = useQuery(
    api.activity.state.clockodoStatusForRoster,
    clockodoUserIds.length > 0 ? { clockodoUserIds } : "skip",
  );
  const statusByUserId = new Map((liveStatuses ?? []).map((s) => [s.clockodoUserId, s.status]));

  useEffect(() => {
    if (rows === null || rows.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await getClockodoRosterHours({
          clockodoUserIds: rows.map((r) => r.id),
        });
        if (!cancelled) {
          setHoursByUserId(new Map(result.map((r) => [r.clockodoUserId, r.hoursThisWeek])));
        }
      } catch (err) {
        console.error("[clockodo] roster hours fetch failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rows, getClockodoRosterHours]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = merged.filter((row) => {
      if (q && !row.name.toLowerCase().includes(q) && !row.email.toLowerCase().includes(q)) {
        return false;
      }
      if (filterUnlinked && row.linkedUserId) return false;
      if (filterMissingHours && row.weeklyHours !== null) return false;
      if (filterMissingVacation && row.vacationDaysPerYear !== null) {
        return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * sort.dir;
      }
      return ((av as number) - (bv as number)) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merged, search, filterUnlinked, filterMissingHours, filterMissingVacation, sort]);

  const gaps = useMemo(
    () =>
      [
        {
          key: "unlinked",
          count: merged.filter((r) => !r.linkedUserId).length,
          active: filterUnlinked,
          toggle: () => setFilterUnlinked((v) => !v),
          label: t("gapUnlinked"),
        },
        {
          key: "missingHours",
          count: merged.filter((r) => r.weeklyHours === null).length,
          active: filterMissingHours,
          toggle: () => setFilterMissingHours((v) => !v),
          label: t("gapMissingHours"),
        },
        {
          key: "missingVacation",
          count: merged.filter((r) => r.vacationDaysPerYear === null).length,
          active: filterMissingVacation,
          toggle: () => setFilterMissingVacation((v) => !v),
          label: t("gapMissingVacation"),
        },
      ].filter((g) => g.count > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [merged, filterUnlinked, filterMissingHours, filterMissingVacation],
  );

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  function toggleSelected(id: number, checked: boolean) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((s) =>
      s.size === visible.length ? new Set() : new Set(visible.map((r) => r.id)),
    );
  }

  async function onCreate() {
    if (!name.trim() || !email.trim()) return;
    setCreating(true);
    try {
      await createClockodoUser({
        name: name.trim(),
        email: email.trim(),
        vacationDaysPerYear: vacationDaysPerYear.trim() ? Number(vacationDaysPerYear) : undefined,
      });
      toast.success(t("created"));
      setName("");
      setEmail("");
      setVacationDaysPerYear("");
      setShowCreate(false);
      await load();
    } catch (err) {
      handleError(err);
    } finally {
      setCreating(false);
    }
  }

  async function onBulkSetVacation(days: number) {
    try {
      await Promise.all(
        [...selectedIds].map((id) => setVacationEntitlement({ clockodoUserId: id, daysPerYear: days })),
      );
      toast.success(t("bulkUpdated", { count: selectedIds.size }));
      setSelectedIds(new Set());
      await load();
    } catch (err) {
      handleError(err);
    }
  }

  async function onBulkSetHours(days: WeekHours) {
    try {
      await Promise.all(
        [...selectedIds].map((id) => setTargetHours({ clockodoUserId: id, ...days })),
      );
      toast.success(t("bulkUpdated", { count: selectedIds.size }));
      setSelectedIds(new Set());
      await load();
    } catch (err) {
      handleError(err);
    }
  }

  function exportCsv() {
    const header = [
      t("name"),
      t("email"),
      t("weeklyHours"),
      t("vacationDaysPerYear"),
      t("linkedEmployee"),
    ];
    const csvRows = visible.map((row) => [
      row.name,
      row.email,
      row.weeklyHours ?? "",
      row.vacationDaysPerYear ?? "",
      row.linkedUserName ?? "",
    ]);
    const csv = [header, ...csvRows].map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "clockodo-roster.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={t("clockodoTitle")}
        description={t("clockodoSubtitle")}
        icon={<Mark provider="clockodo" className="h-6 w-6" />}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={visible.length === 0}>
              <Download className="h-4 w-4" />
              {t("exportCsv")}
            </Button>
            <Button onClick={() => setShowCreate((s) => !s)}>
              <Plus className="h-4 w-4" />
              {t("createUser")}
            </Button>
          </div>
        }
      />

      {showCreate && (
        <Card>
          <CardContent className="grid gap-2 p-4 sm:grid-cols-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("name")} />
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("email")}
            />
            <Input
              type="number"
              value={vacationDaysPerYear}
              onChange={(e) => setVacationDaysPerYear(e.target.value)}
              placeholder={t("vacationDaysPerYear")}
              className="sm:col-span-2"
            />
            <Button
              onClick={onCreate}
              disabled={creating || !name.trim() || !email.trim()}
              className="sm:col-span-2"
            >
              {t("createUser")}
            </Button>
          </CardContent>
        </Card>
      )}

      {gaps.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          {gaps.map((gap) => (
            <button
              key={gap.key}
              type="button"
              onClick={gap.toggle}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-amber-500/10",
                gap.active && "bg-amber-500/15",
              )}
            >
              <span className="flex items-center gap-2">
                <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                {gap.label}
              </span>
              <Badge variant="warning">{gap.count}</Badge>
            </button>
          ))}
        </div>
      )}

      {rows !== null && !loadError && rows.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-8 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-9"
            />
          </div>
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {t("selectedCount", { count: selectedIds.size })}
              </span>
              <Button size="sm" variant="outline" onClick={() => setBulkVacationOpen(true)}>
                {t("bulkSetVacationAction")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBulkHoursOpen(true)}>
                {t("bulkSetHoursAction")}
              </Button>
            </div>
          )}
        </div>
      )}

      {rows === null && !loadError && <Skeleton className="h-64 w-full" />}

      {loadError && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("loadError")}
          </CardContent>
        </Card>
      )}

      {rows !== null && !loadError && rows.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("empty")}
          </CardContent>
        </Card>
      )}

      {rows !== null && !loadError && rows.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-9">
                  <Checkbox
                    checked={visible.length > 0 && selectedIds.size === visible.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label={t("selectAll")}
                  />
                </TableHead>
                <SortableHead label={t("name")} sortKey="name" sort={sort} onSort={toggleSort} />
                <TableHead>{t("email")}</TableHead>
                <TableHead>{t("statusColumn")}</TableHead>
                <SortableHead
                  label={t("weeklyHours")}
                  sortKey="weeklyHours"
                  sort={sort}
                  onSort={toggleSort}
                />
                <TableHead>{t("hoursThisWeekColumn")}</TableHead>
                <SortableHead
                  label={t("vacationDaysPerYear")}
                  sortKey="vacationDaysPerYear"
                  sort={sort}
                  onSort={toggleSort}
                />
                <TableHead>{t("linkedEmployee")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {t("noResults")}
                  </TableCell>
                </TableRow>
              )}
              {visible.map((row) => {
                const status = statusByUserId.get(row.id) ?? null;
                const hours = hoursByUserId.get(row.id);
                return (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/clockodo/admin/${row.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        onCheckedChange={(c) => toggleSelected(row.id, c === true)}
                        aria-label={row.name}
                      />
                    </TableCell>
                    <TableCell className="text-fg">
                      <div className="flex items-center gap-2">
                        {row.name}
                        <Badge
                          variant={row.active === false ? "muted" : "success"}
                          className="text-[10px]"
                        >
                          {row.active === false ? t("inactive") : t("active")}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.email}</TableCell>
                    <TableCell>
                      {status ? (
                        <span className="flex items-center gap-1.5 text-xs">
                          <span className={cn("size-2 rounded-full", STATUS_DOT[status])} />
                          {t(`liveStatus.${status}`)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{row.weeklyHours !== null ? `${row.weeklyHours}h` : "—"}</TableCell>
                    <TableCell>{hours !== undefined ? `${hours}h` : "…"}</TableCell>
                    <TableCell>
                      {row.vacationDaysPerYear !== null
                        ? `${row.vacationDaysPerYear} ${t("days")}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.linkedUserName ?? t("notLinked")}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <BulkVacationDialog
        open={bulkVacationOpen}
        onOpenChange={setBulkVacationOpen}
        count={selectedIds.size}
        onSave={onBulkSetVacation}
      />
      <BulkHoursDialog
        open={bulkHoursOpen}
        onOpenChange={setBulkHoursOpen}
        count={selectedIds.size}
        onSave={onBulkSetHours}
      />

      <TrademarkNotice />
    </section>
  );
}
