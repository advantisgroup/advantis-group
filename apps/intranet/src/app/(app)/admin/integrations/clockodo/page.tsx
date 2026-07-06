"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Plus,
  Search,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Mark } from "@/components/branding/ProviderMark";
import { TrademarkNotice } from "@/components/branding/TrademarkNotice";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface ClockodoUser {
  id: number;
  name: string;
  email: string;
  active?: boolean;
}

interface TargetHourEntry {
  id: number;
  dateSince: string;
  dateUntil: string | null;
  weeklyHours: number | null;
}

interface HolidaysQuotaEntry {
  id: number;
  yearSince: number;
  daysPerYear: number;
  note?: string;
}

interface ClockodoRow extends ClockodoUser {
  weeklyHours: number | null;
  vacationDaysPerYear: number | null;
  targetHoursHistory: TargetHourEntry[];
  holidaysQuotaHistory: HolidaysQuotaEntry[];
  linkedUserId: string | null;
  linkedUserName: string | null;
  deviceId: string | null;
}

type SortKey = "name" | "weeklyHours" | "vacationDaysPerYear";

/** Inline-editable number cell, saves on blur — same UX as the ActivityTrack
 * roster's `EditableId`, duplicated here rather than shared since this is
 * only the second use (extract once a third integration needs it). */
function EditableNumber({
  initial,
  placeholder,
  onSave,
}: {
  initial: number | null;
  placeholder: string;
  onSave: (value: number) => void;
}) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));

  return (
    <Input
      type="number"
      value={value}
      placeholder={placeholder}
      onChange={e => setValue(e.target.value)}
      onBlur={() => {
        const parsed = Number(value);
        if (value.trim() !== "" && Number.isFinite(parsed)) {
          if (parsed !== initial) onSave(parsed);
        } else {
          setValue(initial === null ? "" : String(initial));
        }
      }}
      onKeyDown={e => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="h-8 w-24 text-xs"
    />
  );
}

function LinkedEmployeeCell({
  row,
  users,
  onLink,
  onUnlink,
}: {
  row: ClockodoRow;
  users: { _id: string; name: string }[];
  onLink: (userId: string) => void;
  onUnlink: () => void;
}) {
  const t = useTranslations("Integrations");
  return (
    <div className="flex items-center gap-2">
      <Select
        value={row.linkedUserId ?? "none"}
        onValueChange={v => (v === "none" ? onUnlink() : onLink(v))}
      >
        <SelectTrigger className="h-8 w-full min-w-[10rem] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("notLinked")}</SelectItem>
          {users.map(u => (
            <SelectItem key={u._id} value={u._id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {row.linkedUserId &&
        (row.deviceId ? (
          <Link
            href={`/admin/activity/timeline/${encodeURIComponent(row.deviceId)}`}
            className="shrink-0 text-muted-foreground hover:text-fg"
            title={t("activityTrackLink")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <span
            className="shrink-0 text-[10px] text-muted-foreground"
            title={t("notTrackedYet")}
          >
            {t("notTrackedYet")}
          </span>
        ))}
    </div>
  );
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
          (sort.dir === 1 ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </button>
    </TableHead>
  );
}

function HistoryPanel({ row }: { row: ClockodoRow }) {
  const t = useTranslations("Integrations");
  return (
    <div className="grid gap-4 p-4 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {t("targetHoursHistory")}
        </p>
        {row.targetHoursHistory.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("noHistory")}</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {[...row.targetHoursHistory].reverse().map(entry => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-2 rounded-md bg-panel-2 px-2 py-1"
              >
                <span className="text-muted-foreground">
                  {t("since")} {entry.dateSince}
                  {entry.dateUntil
                    ? ` · ${t("until")} ${entry.dateUntil}`
                    : ` · ${t("ongoing")}`}
                </span>
                <span className="font-medium text-fg">
                  {entry.weeklyHours ?? "—"}h
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {t("vacationHistory")}
        </p>
        {row.holidaysQuotaHistory.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("noHistory")}</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {[...row.holidaysQuotaHistory]
              .sort((a, b) => b.yearSince - a.yearSince)
              .map(entry => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-panel-2 px-2 py-1"
                >
                  <span className="text-muted-foreground">
                    {t("year")} {entry.yearSince}
                  </span>
                  <span className="font-medium text-fg">
                    {entry.daysPerYear} {t("days")}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function ClockodoIntegrationPage() {
  const t = useTranslations("Integrations");
  const handleError = useErrorHandler();

  const listClockodoUsers = useAction(
    api.integrations.clockodo.users.listClockodoUsers
  );
  const getClockodoUserDetail = useAction(
    api.integrations.clockodo.users.getClockodoUserDetail
  );
  const createClockodoUser = useAction(
    api.integrations.clockodo.users.createClockodoUser
  );
  const setTargetHours = useAction(
    api.integrations.clockodo.users.setTargetHours
  );
  const setVacationEntitlement = useAction(
    api.integrations.clockodo.users.setVacationEntitlement
  );
  const linkClockodoUser = useMutation(
    api.integrations.clockodoLink.linkClockodoUser
  );
  const unlinkClockodoUser = useMutation(
    api.integrations.clockodoLink.unlinkClockodoUser
  );

  const links = useQuery(api.integrations.clockodoView.listWithLinks);
  const intranetUsers = useQuery(api.users.list, {});

  const [rows, setRows] = useState<ClockodoRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [weeklyHours, setWeeklyHours] = useState("");
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
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      const users = await listClockodoUsers({});
      // One user's detail fetch failing (network hiccup, an id Clockodo
      // rejects) shouldn't blank the whole table — fall back to "not set"
      // for that row instead of aborting the load.
      const details = await Promise.all(
        users.map(u =>
          getClockodoUserDetail({ clockodoUserId: u.id }).catch(err => {
            console.error(
              `[clockodo] detail fetch failed for user ${u.id}:`,
              err
            );
            return { user: u, targetHours: [], holidaysQuota: [] };
          })
        )
      );
      setRows(
        users.map((u, i) => {
          const detail = details[i];
          const latestTargetHours = detail.targetHours.at(-1) ?? null;
          const latestHolidaysQuota = detail.holidaysQuota.at(-1) ?? null;
          return {
            ...u,
            weeklyHours: latestTargetHours?.weeklyHours ?? null,
            vacationDaysPerYear: latestHolidaysQuota?.daysPerYear ?? null,
            targetHoursHistory: detail.targetHours,
            holidaysQuotaHistory: detail.holidaysQuota,
            linkedUserId: null,
            linkedUserName: null,
            deviceId: null,
          };
        })
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

  // Merge the reactive intranet-side link data into the (non-reactive) live
  // Clockodo list once both are available.
  const merged = (rows ?? []).map(row => {
    const link = links?.find(l => l.clockodoUserId === row.id);
    return {
      ...row,
      linkedUserId: link?.userId ?? null,
      linkedUserName: link?.name ?? null,
      deviceId: link?.deviceId ?? null,
    };
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = merged.filter(row => {
      if (
        q &&
        !row.name.toLowerCase().includes(q) &&
        !row.email.toLowerCase().includes(q)
      ) {
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
  }, [
    merged,
    search,
    filterUnlinked,
    filterMissingHours,
    filterMissingVacation,
    sort,
  ]);

  const linkableUsers = (intranetUsers ?? []).map(u => ({
    _id: u._id as string,
    name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email,
  }));

  function toggleSort(key: SortKey) {
    setSort(s =>
      s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }
    );
  }

  function toggleExpanded(id: number) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onCreate() {
    if (!name.trim() || !email.trim()) return;
    setCreating(true);
    try {
      await createClockodoUser({
        name: name.trim(),
        email: email.trim(),
        weeklyHours: weeklyHours.trim() ? Number(weeklyHours) : undefined,
        vacationDaysPerYear: vacationDaysPerYear.trim()
          ? Number(vacationDaysPerYear)
          : undefined,
      });
      toast.success(t("created"));
      setName("");
      setEmail("");
      setWeeklyHours("");
      setVacationDaysPerYear("");
      setShowCreate(false);
      await load();
    } catch (err) {
      handleError(err);
    } finally {
      setCreating(false);
    }
  }

  async function onSetWeeklyHours(clockodoUserId: number, hours: number) {
    try {
      await setTargetHours({ clockodoUserId, weeklyHours: hours });
      toast.success(t("updated"));
      await load();
    } catch (err) {
      handleError(err);
    }
  }

  async function onSetVacation(clockodoUserId: number, days: number) {
    try {
      await setVacationEntitlement({ clockodoUserId, daysPerYear: days });
      toast.success(t("updated"));
      await load();
    } catch (err) {
      handleError(err);
    }
  }

  async function onLink(clockodoUserId: number, userId: string) {
    try {
      await linkClockodoUser({
        userId: userId as Id<"users">,
        clockodoUserId,
      });
      toast.success(t("linked"));
    } catch (err) {
      handleError(err);
    }
  }

  async function onUnlink(userId: string | null) {
    if (!userId) return;
    try {
      await unlinkClockodoUser({ userId: userId as Id<"users"> });
      toast.success(t("unlinked"));
    } catch (err) {
      handleError(err);
    }
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={t("clockodoTitle")}
        description={t("clockodoSubtitle")}
        icon={<Mark provider="clockodo" className="h-6 w-6" />}
        action={
          <Button onClick={() => setShowCreate(s => !s)}>
            <Plus className="h-4 w-4" />
            {t("createUser")}
          </Button>
        }
      />

      {showCreate && (
        <Card>
          <CardContent className="grid gap-2 p-4 sm:grid-cols-2">
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t("name")}
            />
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t("email")}
            />
            <Input
              type="number"
              value={weeklyHours}
              onChange={e => setWeeklyHours(e.target.value)}
              placeholder={t("weeklyHours")}
            />
            <Input
              type="number"
              value={vacationDaysPerYear}
              onChange={e => setVacationDaysPerYear(e.target.value)}
              placeholder={t("vacationDaysPerYear")}
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

      {rows !== null && !loadError && rows.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={filterUnlinked ? "default" : "outline"}
              onClick={() => setFilterUnlinked(v => !v)}
            >
              {t("filterUnlinked")}
            </Button>
            <Button
              size="sm"
              variant={filterMissingHours ? "default" : "outline"}
              onClick={() => setFilterMissingHours(v => !v)}
            >
              {t("filterMissingHours")}
            </Button>
            <Button
              size="sm"
              variant={filterMissingVacation ? "default" : "outline"}
              onClick={() => setFilterMissingVacation(v => !v)}
            >
              {t("filterMissingVacation")}
            </Button>
          </div>
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
                <TableHead className="w-8" />
                <SortableHead
                  label={t("name")}
                  sortKey="name"
                  sort={sort}
                  onSort={toggleSort}
                />
                <TableHead>{t("email")}</TableHead>
                <SortableHead
                  label={t("weeklyHours")}
                  sortKey="weeklyHours"
                  sort={sort}
                  onSort={toggleSort}
                />
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
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {t("noResults")}
                  </TableCell>
                </TableRow>
              )}
              {visible.map(row => {
                const expanded = expandedIds.has(row.id);
                return (
                  <Fragment key={row.id}>
                    <TableRow>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => toggleExpanded(row.id)}
                          className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-panel-2 hover:text-fg"
                          aria-label={t("targetHoursHistory")}
                        >
                          {expanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
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
                      <TableCell className="text-muted-foreground">
                        {row.email}
                      </TableCell>
                      <TableCell>
                        <EditableNumber
                          initial={row.weeklyHours}
                          placeholder={t("weeklyHours")}
                          onSave={value => void onSetWeeklyHours(row.id, value)}
                        />
                      </TableCell>
                      <TableCell>
                        <EditableNumber
                          initial={row.vacationDaysPerYear}
                          placeholder={t("vacationDaysPerYear")}
                          onSave={value => void onSetVacation(row.id, value)}
                        />
                      </TableCell>
                      <TableCell>
                        <LinkedEmployeeCell
                          row={row}
                          users={linkableUsers}
                          onLink={userId => void onLink(row.id, userId)}
                          onUnlink={() => void onUnlink(row.linkedUserId)}
                        />
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow>
                        <TableCell colSpan={6} className="p-0">
                          <HistoryPanel row={row} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <TrademarkNotice />
    </section>
  );
}
