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
import { PageHeader } from "@/components/PageHeader";
import { useHasCapability } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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

const STATUS_STYLE: Record<string, string> = {
  working: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  break: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  clockedOut: "bg-muted text-muted-foreground",
};

/** A labelled read-only row — the default state of every field on this
 * page. Edit mode swaps this out for the real input, per section. */
function ViewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
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
  const router = useRouter();
  const handleError = useErrorHandler();
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
  const intranetUsers = useQuery(api.users.list, {});
  const liveStatus = useQuery(api.activity.state.clockodoStatusForRoster, {
    clockodoUserIds: [clockodoUserId],
  });

  const [detail, setDetail] = useState<Awaited<
    ReturnType<typeof getClockodoUserDetail>
  > | null>(null);
  const [allUsers, setAllUsers] = useState<Awaited<ReturnType<typeof listClockodoUsers>> | null>(
    null,
  );
  const [hoursThisWeek, setHoursThisWeek] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");

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

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.push("/clockodo/admin")}>
        <ArrowLeft className="h-4 w-4" />
        {t("backToRoster")}
      </Button>

      <PageHeader
        title={user.name}
        description={user.email}
        action={
          <div className="flex items-center gap-2">
            <Badge variant={user.active === false ? "muted" : "success"}>
              {user.active === false ? t("inactive") : t("active")}
            </Badge>
            {status && (
              <Badge variant="outline" className={STATUS_STYLE[status]}>
                {t(`liveStatus.${status}`)}
              </Badge>
            )}
            {hoursThisWeek !== null && (
              <Badge variant="muted">{t("hoursThisWeek", { hours: hoursThisWeek })}</Badge>
            )}
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
          </div>
        }
      />

      <Tabs defaultValue="profile">
        <TabsList className="grid grid-cols-4">
          <TabsTrigger value="profile">{t("tabProfile")}</TabsTrigger>
          <TabsTrigger value="permissions">{t("tabPermissions")}</TabsTrigger>
          <TabsTrigger value="hours">{t("tabHoursVacation")}</TabsTrigger>
          <TabsTrigger value="history">{t("tabHistory")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-5">
          <Section label={t("linkedEmployee")}>
            {mode === "edit" ? (
              <div className="flex items-center gap-2">
                <Select
                  value={link?.userId ?? "none"}
                  onValueChange={(v) =>
                    v === "none"
                      ? void unlinkClockodoUser({ userId: link!.userId })
                      : void linkClockodoUser({ userId: v as Id<"users">, clockodoUserId })
                  }
                >
                  <SelectTrigger className="h-9 flex-1 text-sm">
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
                {link?.deviceId && (
                  <Link
                    href={`/activity/timeline/${encodeURIComponent(link.deviceId)}`}
                    className="shrink-0 text-muted-foreground hover:text-fg"
                    title={t("activityTrackLink")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                )}
              </div>
            ) : (
              <ViewRow label={t("linkedEmployee")} value={link?.name ?? t("notLinked")} />
            )}
          </Section>

          <Section label={t("employment")}>
            {mode === "edit" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("role")}>
                  <Select
                    value={user.role ?? "worker"}
                    onValueChange={(v) => onUpdateUser({ role: v })}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="worker">{t("roleWorker")}</SelectItem>
                      <SelectItem value="owner">{t("roleOwner")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("language")}>
                  <Select
                    value={user.language ?? "de"}
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
                <Field label={t("startDate")}>
                  <Input
                    type="date"
                    value={user.startDate ?? ""}
                    onChange={(e) => onUpdateUser({ startDate: e.target.value })}
                    className="h-9 text-sm"
                  />
                </Field>
                <Field label={t("exitDate")}>
                  <Input
                    type="date"
                    value={user.exitDate ?? ""}
                    onChange={(e) => onUpdateUser({ exitDate: e.target.value || null })}
                    className="h-9 text-sm"
                  />
                </Field>
                <Field label={t("reportsTo")}>
                  <Select
                    value={user.boss !== null ? String(user.boss) : "none"}
                    onValueChange={(v) => onUpdateUser({ boss: v === "none" ? null : Number(v) })}
                  >
                    <SelectTrigger className="h-9 text-sm">
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
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <ViewRow label={t("role")} value={user.role === "owner" ? t("roleOwner") : t("roleWorker")} />
                <ViewRow label={t("language")} value={user.language === "en" ? "English" : "Deutsch"} />
                <ViewRow label={t("startDate")} value={user.startDate ?? t("notSet")} />
                <ViewRow label={t("exitDate")} value={user.exitDate ?? t("notSet")} />
                <ViewRow
                  label={t("reportsTo")}
                  value={
                    user.boss !== null
                      ? (managers.find((m) => m.id === user.boss)?.name ?? t("notSet"))
                      : t("noManager")
                  }
                />
              </div>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="permissions">
          <Section label={t("permissions")}>
            <div className="space-y-2">
              {PERMISSION_ITEMS.map((item) => {
                const checked = Boolean(
                  (user as unknown as Record<string, boolean | undefined>)[item.field],
                );
                return mode === "edit" ? (
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
                      checked={checked}
                      onCheckedChange={(c) => onUpdateUser({ [item.field]: c === true })}
                      className="mt-0.5 h-5 w-5 shrink-0"
                    />
                  </label>
                ) : (
                  <div
                    key={item.field}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border/70 px-3.5 py-3 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-fg">{t(item.labelKey)}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                        {t(item.descKey)}
                      </span>
                    </span>
                    {checked ? (
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <X className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="hours" className="space-y-5">
          <Section label={t("weeklyHours")}>
            {mode === "view" ? (
              <ViewRow
                label={t("weeklyHours")}
                value={latestTargetHours ? `${latestTargetHours.weeklyTotal}h` : t("notSet")}
              />
            ) : (
              <TargetHoursForm
                key={targetHours.length}
                latestDays={latestTargetHours?.days}
                onSave={onSetTargetHours}
              />
            )}
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
            {mode === "view" ? (
              <ViewRow
                label={t("vacationDaysPerYear")}
                value={
                  latestVacation ? `${latestVacation.daysPerYear} ${t("days")}` : t("notSet")
                }
              />
            ) : (
              <EditableNumber
                initial={latestVacation?.daysPerYear ?? null}
                placeholder={t("vacationDaysPerYear")}
                onSave={onSetVacation}
              />
            )}
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
        </TabsContent>

        <TabsContent value="history">
          <Section label={t("tabHistory")}>
            {auditHistory === undefined && <Skeleton className="h-32 w-full" />}
            {auditHistory !== undefined && auditHistory.length === 0 && (
              <p className="text-xs text-muted-foreground">{t("noHistory")}</p>
            )}
            {auditHistory !== undefined && auditHistory.length > 0 && (
              <ul className="space-y-1.5">
                {auditHistory.map((entry) => (
                  <li
                    key={entry._id}
                    className="rounded-md border border-border/70 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-fg">
                        {entry.actor?.name ?? t("unknownActor")}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(entry.at).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-0.5 text-muted-foreground">
                      {t(`auditAction.${entry.action}`)}
                      {entry.detail ? ` — ${entry.detail}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </TabsContent>
      </Tabs>
    </section>
  );
}
