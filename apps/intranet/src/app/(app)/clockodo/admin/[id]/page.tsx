"use client";

import { type ReactNode, useEffect, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowLeft, Check, ExternalLink, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PersonLink } from "@/components/profile/PersonLink";
import { useHasCapability } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useErrorHandler } from "@/hooks/use-error-handler";

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

const PERMISSION_ITEMS = [
  { field: "canGenerallySeeAbsences", labelKey: "canSeeAbsences", descKey: "canSeeAbsencesDesc" },
  {
    field: "canGenerallyManageAbsences",
    labelKey: "canManageAbsences",
    descKey: "canManageAbsencesDesc",
  },
  { field: "canAddCustomers", labelKey: "canAddCustomers", descKey: "canAddCustomersDesc" },
  {
    field: "exemptFromFlextime",
    labelKey: "exemptFromFlextime",
    descKey: "exemptFromFlextimeDesc",
  },
] as const;

const STATUS_ACCENT: Record<string, string> = {
  working: "var(--ok)",
  break: "var(--warn)",
  clockedOut: "var(--muted-foreground)",
};

function StatusDot({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {children}
    </span>
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

/** Day-by-day target-hours (Sollstunden) editor — always creates a *new*
 * dated period, never edits in place (see users.ts's setTargetHours doc). */
function TargetHoursForm({
  latestDays,
  onSave,
}: {
  latestDays: WeekHours | undefined;
  onSave: (input: { dateSince: string } & WeekHours) => void;
}) {
  const t = useTranslations("Integrations");
  const [dateSince, setDateSince] = useState(new Date().toISOString().slice(0, 10));
  const [days, setDays] = useState<WeekHours>(latestDays ?? EMPTY_WEEK);
  const total = WEEKDAYS.reduce((sum, day) => sum + (days[day] || 0), 0);

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border/70 p-3">
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
      className="h-9 w-full text-sm"
    />
  );
}

export default function ClockodoEmployeeDetailPage() {
  const t = useTranslations("Integrations");
  const tc = useTranslations("Common");
  const router = useRouter();
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const params = useParams<{ id: string }>();
  const clockodoUserId = Number(params.id);

  const getClockodoUserDetail = useAction(api.integrations.clockodo.users.getClockodoUserDetail);
  const listClockodoUsers = useAction(api.integrations.clockodo.users.listClockodoUsers);
  const getClockodoRosterHours = useAction(api.integrations.clockodo.users.getClockodoRosterHours);
  const updateClockodoUser = useAction(api.integrations.clockodo.users.updateClockodoUser);
  const setTargetHours = useAction(api.integrations.clockodo.users.setTargetHours);
  const setVacationEntitlement = useAction(api.integrations.clockodo.users.setVacationEntitlement);
  const linkClockodoUser = useMutation(api.integrations.clockodoLink.linkClockodoUser);
  const unlinkClockodoUser = useMutation(api.integrations.clockodoLink.unlinkClockodoUser);

  const canManageClockodo = useHasCapability("manage_clockodo_team");
  const links = useQuery(api.integrations.clockodoView.listWithLinks);
  const intranetUsers = useQuery(api.people.users.list, {});
  const liveStatus = useQuery(api.activity.state.clockodoStatusForRoster, {
    clockodoUserIds: [clockodoUserId],
  });

  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getClockodoUserDetail>> | null>(
    null,
  );
  const [allUsers, setAllUsers] = useState<Awaited<ReturnType<typeof listClockodoUsers>> | null>(
    null,
  );
  const [hoursThisWeek, setHoursThisWeek] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [tab, setTab] = useState("profile");

  useEffect(() => {
    if (!Number.isFinite(clockodoUserId)) return;
    let cancelled = false;
    void (async () => {
      try {
        const [detailResult, usersResult, hoursResult] = await Promise.all([
          getClockodoUserDetail({ clockodoUserId }),
          listClockodoUsers({}),
          getClockodoRosterHours({ clockodoUserIds: [clockodoUserId] }),
        ]);
        if (cancelled) return;
        setDetail(detailResult);
        setAllUsers(usersResult);
        setHoursThisWeek(hoursResult[0]?.hoursThisWeek ?? null);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setLoadError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockodoUserId]);

  const auditHistory = useQuery(
    api.integrations.audit.getClockodoUserAuditHistory,
    detail ? { clockodoUserId, email: detail.user.email } : "skip",
  );

  async function reload() {
    const detailResult = await getClockodoUserDetail({ clockodoUserId });
    setDetail(detailResult);
  }

  async function onUpdateUser(patch: Record<string, unknown>) {
    try {
      await updateClockodoUser({ clockodoUserId, ...patch });
      toast.success(t("updated"));
      await reload();
    } catch (err) {
      handleError(err);
    }
  }

  async function onSetTargetHours(input: { dateSince: string } & WeekHours) {
    try {
      await setTargetHours({ clockodoUserId, ...input });
      toast.success(t("updated"));
      await reload();
    } catch (err) {
      handleError(err);
    }
  }

  async function onSetVacation(days: number) {
    try {
      await setVacationEntitlement({ clockodoUserId, daysPerYear: days });
      toast.success(t("updated"));
      await reload();
    } catch (err) {
      handleError(err);
    }
  }

  if (!canManageClockodo) {
    return <ForbiddenScreen />;
  }

  if (loadError) {
    return (
      <section className="mx-auto max-w-4xl space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push("/clockodo/admin")}>
          <ArrowLeft className="h-4 w-4" />
          {t("backToRoster")}
        </Button>
        <p className="py-10 text-center text-sm text-muted-foreground">{t("loadError")}</p>
      </section>
    );
  }

  if (!detail || !allUsers) {
    return (
      <section className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </section>
    );
  }

  const { user, targetHours, holidaysQuota } = detail;
  const link = links?.find((l) => l.clockodoUserId === String(clockodoUserId));
  const linkableUsers = (intranetUsers ?? []).map((u) => ({
    _id: u._id as string,
    name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email,
  }));
  const managers = allUsers.filter((m) => m.id !== clockodoUserId);
  const targetHoursDesc = [...targetHours].reverse();
  const vacationDesc = [...holidaysQuota].sort((a, b) => b.yearSince - a.yearSince);
  const latestTargetHours = targetHours.at(-1);
  const latestVacation = holidaysQuota.at(-1);
  const status = liveStatus?.[0]?.status ?? null;

  const roleLabel = user.role === "owner" ? t("roleOwner") : t("roleWorker");
  const languageLabel = user.language === "en" ? "English" : "Deutsch";
  const bossLabel =
    user.boss !== null
      ? (managers.find((m) => m.id === user.boss)?.name ?? t("notSet"))
      : t("noManager");
  const weeklyHoursLabel = latestTargetHours ? `${latestTargetHours.weeklyTotal}h` : t("notSet");
  const vacationLabel = latestVacation ? `${latestVacation.daysPerYear} ${t("days")}` : t("notSet");

  const editToggle = (
    <Button
      variant={mode === "edit" ? "default" : "outline"}
      size="sm"
      onClick={() => setMode((m) => (m === "edit" ? "view" : "edit"))}
    >
      {mode === "edit" ? (
        <>
          <Check className="h-4 w-4" />
          {t("doneEditing")}
        </>
      ) : (
        <>
          <Pencil className="h-4 w-4" />
          {t("edit")}
        </>
      )}
    </Button>
  );

  const backButton = (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2"
      onClick={() => router.push("/clockodo/admin")}
    >
      <ArrowLeft className="h-4 w-4" />
      {t("backToRoster")}
    </Button>
  );

  const tabNav = (
    <>
      {/* A full-width horizontal strip here would be a second control
          competing with the mobile bottom nav's thumb-zone space, so below
          md this collapses to a single compact Select instead. */}
      <TabsList className="hidden md:inline-flex">
        <TabsTrigger value="profile">{t("tabProfile")}</TabsTrigger>
        <TabsTrigger value="permissions">{t("tabPermissions")}</TabsTrigger>
        <TabsTrigger value="hours">{t("tabHoursVacation")}</TabsTrigger>
        <TabsTrigger value="history">{t("tabHistory")}</TabsTrigger>
      </TabsList>
      <Select value={tab} onValueChange={setTab}>
        <SelectTrigger className="md:hidden">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="profile">{t("tabProfile")}</SelectItem>
          <SelectItem value="permissions">{t("tabPermissions")}</SelectItem>
          <SelectItem value="hours">{t("tabHoursVacation")}</SelectItem>
          <SelectItem value="history">{t("tabHistory")}</SelectItem>
        </SelectContent>
      </Select>
    </>
  );

  const linkSelect = (className: string) => (
    <Select
      value={link?.userId ?? "none"}
      onValueChange={async (v) => {
        if (v === "none") {
          const ok = await confirm({
            title: t("confirmUnlinkTitle"),
            description: t("confirmUnlinkBody"),
            confirmLabel: t("notLinked"),
            cancelLabel: tc("cancel"),
          });
          if (!ok) return;
          void unlinkClockodoUser({ userId: link!.userId });
        } else {
          void linkClockodoUser({ userId: v as Id<"users">, clockodoUserId });
        }
      }}
    >
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t("notLinked")}</SelectItem>
        {linkableUsers.map((u) => (
          <SelectItem key={u._id} value={u._id}>
            {u.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const activityLink = link?.deviceId && (
    <Link
      href={`/activity/timeline/${encodeURIComponent(link.deviceId)}`}
      className="shrink-0 text-muted-foreground hover:text-fg"
      title={t("activityTrackLink")}
    >
      <ExternalLink className="h-4 w-4" />
    </Link>
  );

  const roleSelect = (className: string) => (
    <Select value={user.role ?? "worker"} onValueChange={(v) => onUpdateUser({ role: v })}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="worker">{t("roleWorker")}</SelectItem>
        <SelectItem value="owner">{t("roleOwner")}</SelectItem>
      </SelectContent>
    </Select>
  );

  const languageSelect = (className: string) => (
    <Select value={user.language ?? "de"} onValueChange={(v) => onUpdateUser({ language: v })}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="de">Deutsch</SelectItem>
        <SelectItem value="en">English</SelectItem>
      </SelectContent>
    </Select>
  );

  const startDateInput = (className: string) => (
    <Input
      type="date"
      value={user.startDate ?? ""}
      onChange={(e) => onUpdateUser({ startDate: e.target.value })}
      className={className}
    />
  );

  const exitDateInput = (className: string) => (
    <Input
      type="date"
      value={user.exitDate ?? ""}
      onChange={(e) => onUpdateUser({ exitDate: e.target.value || null })}
      className={className}
    />
  );

  const bossSelect = (className: string) => (
    <Select
      value={user.boss !== null ? String(user.boss) : "none"}
      onValueChange={(v) => onUpdateUser({ boss: v === "none" ? null : Number(v) })}
    >
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t("noManager")}</SelectItem>
        {managers.map((m) => (
          <SelectItem key={m.id} value={String(m.id)}>
            {m.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const permissionChecked = (field: (typeof PERMISSION_ITEMS)[number]["field"]) =>
    Boolean((user as unknown as Record<string, boolean | undefined>)[field]);

  const targetHistory = (
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
  );

  const vacationHistory = (
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
  );

  const targetHoursForm = (
    <TargetHoursForm
      key={targetHours.length}
      latestDays={latestTargetHours?.days}
      onSave={onSetTargetHours}
    />
  );

  const vacationInput = (
    <EditableNumber
      initial={latestVacation?.daysPerYear ?? null}
      placeholder={t("vacationDaysPerYear")}
      onSave={onSetVacation}
    />
  );

  const editing = mode === "edit";
  const value = (text: ReactNode) => <span className="text-sm text-muted-foreground">{text}</span>;
  const control = "h-9 w-44 text-sm md:h-8";

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      {backButton}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{user.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="truncate">{user.email}</span>
            <StatusDot color={user.active === false ? "var(--muted-foreground)" : "var(--ok)"}>
              {user.active === false ? t("inactive") : t("active")}
            </StatusDot>
            {status && (
              <StatusDot color={STATUS_ACCENT[status]}>{t(`liveStatus.${status}`)}</StatusDot>
            )}
            {hoursThisWeek !== null && <span>{t("hoursThisWeek", { hours: hoursThisWeek })}</span>}
          </p>
        </div>
        {editToggle}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        {tabNav}

        <TabsContent value="profile" className="mt-6">
          <SettingsSection title={t("employment")}>
            <SettingsRow
              title={t("linkedEmployee")}
              control={
                editing ? (
                  <div className="flex items-center gap-2">
                    {linkSelect(control)}
                    {activityLink}
                  </div>
                ) : link ? (
                  <PersonLink userId={link.userId} className="text-sm">
                    {link.name}
                  </PersonLink>
                ) : (
                  value(t("notLinked"))
                )
              }
            />
            <SettingsRow
              title={t("role")}
              control={editing ? roleSelect(control) : value(roleLabel)}
            />
            <SettingsRow
              title={t("language")}
              control={editing ? languageSelect(control) : value(languageLabel)}
            />
            <SettingsRow
              title={t("startDate")}
              control={editing ? startDateInput(control) : value(user.startDate ?? t("notSet"))}
            />
            <SettingsRow
              title={t("exitDate")}
              control={editing ? exitDateInput(control) : value(user.exitDate ?? t("notSet"))}
            />
            <SettingsRow
              title={t("reportsTo")}
              control={editing ? bossSelect(control) : value(bossLabel)}
            />
          </SettingsSection>
        </TabsContent>

        <TabsContent value="permissions" className="mt-6">
          <SettingsSection title={t("permissions")}>
            {PERMISSION_ITEMS.map((item) => {
              const checked = permissionChecked(item.field);
              return (
                <SettingsRow
                  key={item.field}
                  title={t(item.labelKey)}
                  description={t(item.descKey)}
                  control={
                    editing ? (
                      <Switch
                        checked={checked}
                        aria-label={t(item.labelKey)}
                        onCheckedChange={(c) => onUpdateUser({ [item.field]: c })}
                      />
                    ) : checked ? (
                      <Check className="size-4 text-ok" />
                    ) : (
                      <X className="size-4 text-muted-foreground" />
                    )
                  }
                />
              );
            })}
          </SettingsSection>
        </TabsContent>

        <TabsContent value="hours" className="mt-6">
          <SettingsSection title={t("tabHoursVacation")}>
            <SettingsRow
              title={t("weeklyHours")}
              control={editing ? undefined : value(weeklyHoursLabel)}
            >
              {editing && <div className="mt-3">{targetHoursForm}</div>}
            </SettingsRow>
            <div className="px-4 py-3">{targetHistory}</div>
            <SettingsRow
              title={t("vacationDaysPerYear")}
              control={editing ? <div className="w-32">{vacationInput}</div> : value(vacationLabel)}
            />
            <div className="px-4 py-3">{vacationHistory}</div>
          </SettingsSection>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <SettingsSection title={t("tabHistory")}>
            {auditHistory === undefined ? (
              <div className="p-4">
                <Skeleton className="h-24 w-full" />
              </div>
            ) : auditHistory.length === 0 ? (
              <p className="px-4 py-3.5 text-sm text-muted-foreground">{t("noHistory")}</p>
            ) : (
              auditHistory.map((entry) => (
                <SettingsRow
                  key={entry._id}
                  title={entry.actor?.name ?? t("unknownActor")}
                  description={`${t(`auditAction.${entry.action}`)}${entry.detail ? ` — ${entry.detail}` : ""}`}
                  control={
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.at).toLocaleString()}
                    </span>
                  }
                />
              ))
            )}
          </SettingsSection>
        </TabsContent>
      </Tabs>
    </section>
  );
}
