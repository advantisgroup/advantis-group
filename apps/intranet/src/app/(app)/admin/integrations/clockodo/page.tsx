"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { ExternalLink, Plug, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { TrademarkNotice } from "@/components/branding/TrademarkNotice";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
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

interface ClockodoUser {
  id: number;
  name: string;
  email: string;
  active?: boolean;
}

interface ClockodoRow extends ClockodoUser {
  weeklyHours: number | null;
  vacationDaysPerYear: number | null;
  linkedUserId: string | null;
  linkedUserName: string | null;
  deviceId: string | null;
}

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

  const load = useCallback(async () => {
    try {
      const users = await listClockodoUsers({});
      const details = await Promise.all(
        users.map(u => getClockodoUserDetail({ clockodoUserId: u.id }))
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

  const linkableUsers = (intranetUsers ?? []).map(u => ({
    _id: u._id as string,
    name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email,
  }));

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
        icon={<Plug />}
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
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("email")}</TableHead>
                <TableHead>{t("weeklyHours")}</TableHead>
                <TableHead>{t("vacationDaysPerYear")}</TableHead>
                <TableHead>{t("linkedEmployee")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {merged.map(row => (
                <TableRow key={row.id}>
                  <TableCell className="text-fg">{row.name}</TableCell>
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
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <TrademarkNotice />
    </section>
  );
}
