"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Drawer } from "vaul";

import { Mark } from "@/components/branding/ProviderMark";
import { TrademarkNotice } from "@/components/branding/TrademarkNotice";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { useSlashFocus } from "@/lib/activity/useSlashFocus";

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
  role?: string;
  startDate: string | null;
  exitDate: string | null;
  boss: number | null;
  language?: string;
  canGenerallySeeAbsences?: boolean;
  canGenerallyManageAbsences?: boolean;
  canAddCustomers?: boolean;
  exemptFromFlextime?: boolean;
}

interface TargetHourEntry {
  id: number;
  dateSince: string;
  dateUntil: string | null;
  days: WeekHours;
  weeklyTotal: number;
}

interface HolidaysQuotaEntry {
  id: number;
  yearSince: number;
  yearUntil: number | null;
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
type LinkableUser = { _id: string; name: string };

/** Inline-editable number field, saves on blur — same UX as the
 * ActivityTrack roster's `EditableId`, duplicated here rather than shared
 * since this is only the second use (extract once a third integration
 * needs it). */
function EditableNumber({
  initial,
  placeholder,
  onSave,
  className = "w-24",
}: {
  initial: number | null;
  placeholder: string;
  onSave: (value: number) => void;
  className?: string;
}) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));

  return (
    <Input
      type="number"
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const parsed = Number(value);
        if (value.trim() !== "" && Number.isFinite(parsed)) {
          if (parsed !== initial) onSave(parsed);
        } else {
          setValue(initial === null ? "" : String(initial));
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={`h-8 text-xs ${className}`}
    />
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
          (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </TableHead>
  );
}

const PERMISSION_ITEMS = [
  {
    field: "canGenerallySeeAbsences",
    labelKey: "canSeeAbsences",
    descKey: "canSeeAbsencesDesc",
  },
  {
    field: "canGenerallyManageAbsences",
    labelKey: "canManageAbsences",
    descKey: "canManageAbsencesDesc",
  },
  {
    field: "canAddCustomers",
    labelKey: "canAddCustomers",
    descKey: "canAddCustomersDesc",
  },
  {
    field: "exemptFromFlextime",
    labelKey: "exemptFromFlextime",
    descKey: "exemptFromFlextimeDesc",
  },
] as const satisfies {
  field: keyof Pick<
    ClockodoUser,
    | "canGenerallySeeAbsences"
    | "canGenerallyManageAbsences"
    | "canAddCustomers"
    | "exemptFromFlextime"
  >;
  labelKey: string;
  descKey: string;
}[];

/** A labelled section, so the detail panel reads like a tidy info card
 * (mirrors `Section` in the shared member profile). */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

/** Labelled form field for the compact 2-column employment grid. */
function Field({
  label,
  children,
  span2,
}: {
  label: string;
  children: ReactNode;
  span2?: boolean;
}) {
  return (
    <div className={span2 ? "col-span-2" : undefined}>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function HistoryList<T extends { id: number }>({
  entries,
  render,
}: {
  entries: T[];
  render: (entry: T) => ReactNode;
}) {
  const t = useTranslations("Integrations");
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("noHistory")}</p>;
  }
  return (
    <ul className="space-y-1">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-md bg-panel-2 px-2 py-1.5 text-xs">
          {render(entry)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Day-by-day target-hours (Sollstunden) editor. Always creates a *new*
 * dated period rather than editing in place — Clockodo has no flat
 * "weekly hours" field, only per-weekday hours summed for the total, and a
 * history of periods each starting on a chosen date (today, or scheduled
 * for later). Keyed by clockodoUserId from the parent so switching rows
 * resets this form's local state instead of carrying over stale values.
 */
function TargetHoursForm({
  row,
  onSave,
}: {
  row: ClockodoRow;
  onSave: (input: { dateSince: string } & WeekHours) => void;
}) {
  const t = useTranslations("Integrations");
  const latest = row.targetHoursHistory.at(-1);
  const [dateSince, setDateSince] = useState(new Date().toISOString().slice(0, 10));
  const [days, setDays] = useState<WeekHours>(latest?.days ?? EMPTY_WEEK);
  const total = WEEKDAYS.reduce((sum, day) => sum + (days[day] || 0), 0);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
        {WEEKDAYS.map((day) => (
          <div key={day}>
            <label className="block text-center text-[10px] text-muted-foreground">{t(day)}</label>
            <Input
              type="number"
              value={days[day]}
              onChange={(e) => setDays((d) => ({ ...d, [day]: Number(e.target.value) || 0 }))}
              className="h-8 px-1 text-center text-xs"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={dateSince}
          onChange={(e) => setDateSince(e.target.value)}
          className="h-8 flex-1 text-xs"
        />
        <span className="shrink-0 text-xs text-muted-foreground">
          {t("weeklyTotal")}: <strong className="text-fg">{total}h</strong>
        </span>
      </div>
      <Button size="sm" className="w-full" onClick={() => onSave({ dateSince, ...days })}>
        {t("saveNewPeriod")}
      </Button>
    </div>
  );
}

function ClockodoUserDetailBody({
  row,
  users,
  managers,
  onUpdateUser,
  onSetTargetHours,
  onSetVacation,
  onLink,
  onUnlink,
}: {
  row: ClockodoRow;
  users: LinkableUser[];
  managers: { id: number; name: string }[];
  onUpdateUser: (patch: Record<string, unknown>) => void;
  onSetTargetHours: (input: { dateSince: string } & WeekHours) => void;
  onSetVacation: (days: number) => void;
  onLink: (userId: string) => void;
  onUnlink: () => void;
}) {
  const t = useTranslations("Integrations");
  const targetHoursDesc = [...row.targetHoursHistory].reverse();
  const vacationDesc = [...row.holidaysQuotaHistory].sort((a, b) => b.yearSince - a.yearSince);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border/70 p-5">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold leading-tight">{row.name}</p>
          <p className="truncate text-sm text-muted-foreground">{row.email}</p>
        </div>
        <Badge variant={row.active === false ? "muted" : "success"} className="shrink-0">
          {row.active === false ? t("inactive") : t("active")}
        </Badge>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        <Section label={t("linkedEmployee")}>
          <div className="flex items-center gap-2">
            <Select
              value={row.linkedUserId ?? "none"}
              onValueChange={(v) => (v === "none" ? onUnlink() : onLink(v))}
            >
              <SelectTrigger className="h-9 flex-1 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("notLinked")}</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u._id} value={u._id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {row.linkedUserId &&
              (row.deviceId ? (
                <Link
                  href={`/activity/timeline/${encodeURIComponent(row.deviceId)}`}
                  className="shrink-0 text-muted-foreground hover:text-fg"
                  title={t("activityTrackLink")}
                >
                  <ExternalLink className="h-4 w-4" />
                </Link>
              ) : (
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {t("notTrackedYet")}
                </span>
              ))}
          </div>
        </Section>

        <Section label={t("employment")}>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("role")} span2>
              <Select value={row.role ?? "worker"} onValueChange={(v) => onUpdateUser({ role: v })}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="worker">{t("roleWorker")}</SelectItem>
                  <SelectItem value="owner">{t("roleOwner")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("startDate")}>
              <Input
                type="date"
                value={row.startDate ?? ""}
                onChange={(e) => onUpdateUser({ startDate: e.target.value })}
                className="h-9 text-sm"
              />
            </Field>
            <Field label={t("exitDate")}>
              <Input
                type="date"
                value={row.exitDate ?? ""}
                onChange={(e) => onUpdateUser({ exitDate: e.target.value || null })}
                className="h-9 text-sm"
              />
            </Field>
            <Field label={t("reportsTo")} span2>
              <Select
                value={row.boss !== null ? String(row.boss) : "none"}
                onValueChange={(v) => onUpdateUser({ boss: v === "none" ? null : Number(v) })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noManager")}</SelectItem>
                  {managers
                    .filter((m) => m.id !== row.id)
                    .map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("language")} span2>
              <Select
                value={row.language ?? "de"}
                onValueChange={(v) => onUpdateUser({ language: v })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </Section>

        <Section label={t("permissions")}>
          <div className="space-y-2">
            {PERMISSION_ITEMS.map((item) => (
              <label
                key={item.field}
                className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border/70 bg-panel-2 px-3.5 py-3 text-sm transition-colors active:bg-panel-2/70"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-fg">{t(item.labelKey)}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                    {t(item.descKey)}
                  </span>
                </span>
                <Checkbox
                  checked={row[item.field] ?? false}
                  onCheckedChange={(c) => onUpdateUser({ [item.field]: c === true })}
                  className="mt-0.5 h-5 w-5 shrink-0"
                />
              </label>
            ))}
          </div>
        </Section>

        <Section label={t("weeklyHours")}>
          <TargetHoursForm key={row.id} row={row} onSave={onSetTargetHours} />
          <HistoryList
            entries={targetHoursDesc}
            render={(e) => (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("since")} {e.dateSince}
                    {e.dateUntil ? ` · ${t("until")} ${e.dateUntil}` : ` · ${t("ongoing")}`}
                  </span>
                  <span className="font-medium text-fg">{e.weeklyTotal}h</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {WEEKDAYS.map((day) => `${t(day)} ${e.days[day]}`).join(" · ")}
                </span>
              </div>
            )}
          />
        </Section>

        <Section label={t("vacationDaysPerYear")}>
          <EditableNumber
            initial={row.vacationDaysPerYear}
            placeholder={t("vacationDaysPerYear")}
            onSave={onSetVacation}
            className="w-full"
          />
          <HistoryList
            entries={vacationDesc}
            render={(e) => (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("year")} {e.yearSince}
                  {e.yearUntil && e.yearUntil !== e.yearSince ? `–${e.yearUntil}` : ""}
                </span>
                <span className="font-medium text-fg">
                  {e.daysPerYear} {t("days")}
                </span>
              </div>
            )}
          />
        </Section>
      </div>
    </div>
  );
}

/**
 * Per-person management panel — a dialog on desktop, a bottom sheet on
 * mobile (matching the shared member `UserProfile` pattern). Splitting this
 * out of the table is the whole point: a roster table needs to stay
 * scannable, editing everything below needs room to breathe.
 */
function ClockodoUserDetail({
  row,
  users,
  managers,
  open,
  onOpenChange,
  onUpdateUser,
  onSetTargetHours,
  onSetVacation,
  onLink,
  onUnlink,
}: {
  row: ClockodoRow | null;
  users: LinkableUser[];
  managers: { id: number; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateUser: (patch: Record<string, unknown>) => void;
  onSetTargetHours: (input: { dateSince: string } & WeekHours) => void;
  onSetVacation: (days: number) => void;
  onLink: (userId: string) => void;
  onUnlink: () => void;
}) {
  const isMobile = useIsMobile();
  if (!row) return null;

  const body = (
    <ClockodoUserDetailBody
      row={row}
      users={users}
      managers={managers}
      onUpdateUser={onUpdateUser}
      onSetTargetHours={onSetTargetHours}
      onSetVacation={onSetVacation}
      onLink={onLink}
      onUnlink={onUnlink}
    />
  );

  if (isMobile) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Drawer.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-background text-foreground shadow-2xl shadow-black/40 outline-none"
          >
            <Drawer.Title className="sr-only">{row.name}</Drawer.Title>
            <div className="flex shrink-0 cursor-grab items-center justify-center pb-1 pt-3 active:cursor-grabbing">
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{body}</div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{row.name}</DialogTitle>
        {body}
      </DialogContent>
    </Dialog>
  );
}

export default function ClockodoIntegrationPage() {
  const t = useTranslations("Integrations");
  const handleError = useErrorHandler();

  const listClockodoUsers = useAction(api.integrations.clockodo.users.listClockodoUsers);
  const getClockodoUserDetail = useAction(api.integrations.clockodo.users.getClockodoUserDetail);
  const createClockodoUser = useAction(api.integrations.clockodo.users.createClockodoUser);
  const updateClockodoUser = useAction(api.integrations.clockodo.users.updateClockodoUser);
  const setTargetHours = useAction(api.integrations.clockodo.users.setTargetHours);
  const setVacationEntitlement = useAction(api.integrations.clockodo.users.setVacationEntitlement);
  const linkClockodoUser = useMutation(api.integrations.clockodoLink.linkClockodoUser);
  const unlinkClockodoUser = useMutation(api.integrations.clockodoLink.unlinkClockodoUser);

  const links = useQuery(api.integrations.clockodoView.listWithLinks);
  const intranetUsers = useQuery(api.users.list, {});

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
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const users = await listClockodoUsers({});
      // One user's detail fetch failing (network hiccup, an id Clockodo
      // rejects) shouldn't blank the whole table — fall back to "not set"
      // for that row instead of aborting the load.
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
            targetHoursHistory: detail.targetHours,
            holidaysQuotaHistory: detail.holidaysQuota,
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

  // Merge the reactive intranet-side link data into the (non-reactive) live
  // Clockodo list once both are available.
  const merged = (rows ?? []).map((row) => {
    const link = links?.find((l) => l.clockodoUserId === String(row.id));
    return {
      ...row,
      linkedUserId: link?.userId ?? null,
      linkedUserName: link?.name ?? null,
      deviceId: link?.deviceId ?? null,
    };
  });

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
  }, [merged, search, filterUnlinked, filterMissingHours, filterMissingVacation, sort]);

  const linkableUsers = (intranetUsers ?? []).map((u) => ({
    _id: u._id as string,
    name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email,
  }));

  const managers = merged.map((r) => ({ id: r.id, name: r.name }));

  const selectedRow = selectedId ? (merged.find((r) => r.id === selectedId) ?? null) : null;

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
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

  async function onUpdateUser(clockodoUserId: number, patch: Record<string, unknown>) {
    try {
      await updateClockodoUser({ clockodoUserId, ...patch });
      toast.success(t("updated"));
      await load();
    } catch (err) {
      handleError(err);
    }
  }

  async function onSetTargetHours(
    clockodoUserId: number,
    input: { dateSince: string } & WeekHours,
  ) {
    try {
      await setTargetHours({ clockodoUserId, ...input });
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
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={t("clockodoTitle")}
        description={t("clockodoSubtitle")}
        icon={<Mark provider="clockodo" className="h-6 w-6" />}
        action={
          <Button onClick={() => setShowCreate((s) => !s)}>
            <Plus className="h-4 w-4" />
            {t("createUser")}
          </Button>
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
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={filterUnlinked ? "default" : "outline"}
              onClick={() => setFilterUnlinked((v) => !v)}
            >
              {t("filterUnlinked")}
            </Button>
            <Button
              size="sm"
              variant={filterMissingHours ? "default" : "outline"}
              onClick={() => setFilterMissingHours((v) => !v)}
            >
              {t("filterMissingHours")}
            </Button>
            <Button
              size="sm"
              variant={filterMissingVacation ? "default" : "outline"}
              onClick={() => setFilterMissingVacation((v) => !v)}
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
                <SortableHead label={t("name")} sortKey="name" sort={sort} onSort={toggleSort} />
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
                    colSpan={5}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {t("noResults")}
                  </TableCell>
                </TableRow>
              )}
              {visible.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedId(row.id)}
                >
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
                  <TableCell>{row.weeklyHours !== null ? `${row.weeklyHours}h` : "—"}</TableCell>
                  <TableCell>
                    {row.vacationDaysPerYear !== null
                      ? `${row.vacationDaysPerYear} ${t("days")}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.linkedUserName ?? t("notLinked")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <ClockodoUserDetail
        row={selectedRow}
        users={linkableUsers}
        managers={managers}
        open={selectedRow !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onUpdateUser={(patch) => {
          if (selectedRow) void onUpdateUser(selectedRow.id, patch);
        }}
        onSetTargetHours={(input) => {
          if (selectedRow) void onSetTargetHours(selectedRow.id, input);
        }}
        onSetVacation={(days) => {
          if (selectedRow) void onSetVacation(selectedRow.id, days);
        }}
        onLink={(userId) => {
          if (selectedRow) void onLink(selectedRow.id, userId);
        }}
        onUnlink={() => {
          if (selectedRow) void onUnlink(selectedRow.linkedUserId);
        }}
      />

      <TrademarkNotice />
    </section>
  );
}
