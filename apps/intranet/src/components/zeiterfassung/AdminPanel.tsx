"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { berlinDate } from "@advantis/convex/time";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarPlus,
  Check,
  ChevronRight,
  Inbox,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  ScrollText,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
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
import { Textarea } from "@/components/ui/textarea";
import {
  AbsenceTypeLabel,
  Chip,
  clockStatusClassName,
  FieldLabel,
  Segmented,
} from "@/components/zeiterfassung/parts";
import { matchesSearch } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  formatClock,
  formatDay,
  formatDays,
  formatMinutes,
  formatMonth,
  useBerlinToday,
  useTimeErrorToast,
} from "@/lib/zeiterfassung";

type Section = "people" | "approvals" | "holidays" | "locks" | "audit";

const SECTIONS: Section[] = ["people", "approvals", "holidays", "locks", "audit"];

/** Admin area: people, approvals, holidays, month locks and the audit log. */
export function AdminPanel({ initialSection }: { initialSection?: string | null }) {
  const t = useTranslations("Zeiterfassung");
  const approvals = useQuery(api.time.admin.approvals);
  const waiting = approvals ? approvals.absences.length + approvals.corrections.length : 0;
  const [section, setSection] = useState<Section>(
    SECTIONS.includes(initialSection as Section) ? (initialSection as Section) : "people",
  );

  return (
    <div className="space-y-4">
      <Segmented
        value={section}
        onChange={setSection}
        options={SECTIONS.map((value) => ({
          value,
          label:
            value === "approvals" && waiting > 0
              ? `${t(`admin.section.${value}`)} (${waiting})`
              : t(`admin.section.${value}`),
        }))}
      />
      {section === "people" && <People />}
      {section === "approvals" && <Approvals data={approvals} />}
      {section === "holidays" && <Holidays />}
      {section === "locks" && <Locks />}
      {section === "audit" && <AuditLog />}
    </div>
  );
}

function People() {
  const t = useTranslations("Zeiterfassung");
  const locale = useLocale();
  const today = useBerlinToday();
  const rows = useQuery(api.time.admin.people, { today });
  const [query, setQuery] = useState("");
  const filtered = (rows ?? []).filter((row) => matchesSearch(query, row.name, row.email));

  return (
    <div className="space-y-3">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("admin.search")}
          aria-label={t("admin.search")}
          className="h-9 pl-8 text-sm md:h-8 md:text-[13px]"
        />
      </div>
      {rows === undefined ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Users />} title={t("admin.noPeople")} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("admin.person")}</TableHead>
                <TableHead className="w-44">{t("admin.today")}</TableHead>
                <TableHead className="w-32 text-right">{t("admin.balance")}</TableHead>
                <TableHead className="hidden w-32 text-right md:table-cell">
                  {t("admin.vacationLeft")}
                </TableHead>
                <TableHead className="hidden w-44 lg:table-cell">{t("admin.flags")}</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell className="max-w-0">
                    <Link
                      href={`/zeiterfassung/admin/${row.userId}`}
                      className="block truncate font-medium hover:underline"
                    >
                      {row.name}
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.email}
                    </span>
                  </TableCell>
                  <TableCell>
                    {row.status === "absent" && row.absentType ? (
                      <span className="text-xs">
                        <AbsenceTypeLabel type={row.absentType} />
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
                          clockStatusClassName(row.status === "absent" ? "out" : row.status),
                        )}
                      >
                        {t(`clock.status.${row.status === "absent" ? "out" : row.status}`)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    className={cn("text-right tabular-nums", row.balanceMinutes < 0 && "text-warn")}
                  >
                    {formatMinutes(row.balanceMinutes, true)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {formatDays(row.vacationRemaining, locale)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="flex flex-wrap gap-1">
                      {row.pendingAbsences + row.pendingCorrections > 0 && (
                        <Chip>
                          {t("admin.pending", {
                            count: row.pendingAbsences + row.pendingCorrections,
                          })}
                        </Chip>
                      )}
                      {row.autoClosed > 0 && (
                        <Chip tone="warn">{t("admin.autoClosed", { count: row.autoClosed })}</Chip>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/zeiterfassung/admin/${row.userId}`}
                      aria-label={t("admin.open")}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ChevronRight className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

type ApprovalsData = NonNullable<ReturnType<typeof useQuery<typeof api.time.admin.approvals>>>;

function Approvals({ data }: { data: ApprovalsData | undefined }) {
  const t = useTranslations("Zeiterfassung");
  const locale = useLocale();
  const decideAbsence = useMutation(api.time.absences.decide);
  const decideCorrection = useMutation(api.time.entries.decide);
  const showError = useTimeErrorToast();
  const [rejecting, setRejecting] = useState<
    { kind: "absence"; id: Id<"timeAbsences"> } | { kind: "entry"; id: Id<"timeEntries"> } | null
  >(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide(
    target: { kind: "absence"; id: Id<"timeAbsences"> } | { kind: "entry"; id: Id<"timeEntries"> },
    approve: boolean,
    decisionNote?: string,
  ) {
    setBusy(true);
    try {
      if (target.kind === "absence") {
        await decideAbsence({ id: target.id, approve, note: decisionNote });
      } else {
        await decideCorrection({ entryId: target.id, approve, note: decisionNote });
      }
      toast.success(approve ? t("admin.approved") : t("admin.rejected"));
      setRejecting(null);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  if (data === undefined) return <Skeleton className="h-48 rounded-xl" />;
  if (data.absences.length === 0 && data.corrections.length === 0) {
    return <EmptyState icon={<Inbox />} title={t("admin.nothingWaiting")} />;
  }

  const actions = (
    target: { kind: "absence"; id: Id<"timeAbsences"> } | { kind: "entry"; id: Id<"timeEntries"> },
  ) => (
    <div className="flex shrink-0 justify-end gap-1.5">
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => {
          setNote("");
          setRejecting(target);
        }}
      >
        <X />
        {t("admin.reject")}
      </Button>
      <Button size="sm" disabled={busy} onClick={() => void decide(target, true)}>
        <Check />
        {t("admin.approve")}
      </Button>
    </div>
  );

  return (
    <div className="space-y-5">
      {data.absences.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t("admin.absenceRequests")}</h3>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
            {data.absences.map((row) => (
              <li
                key={row._id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">{row.person?.name}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <AbsenceTypeLabel type={row.type} />
                    <span>
                      {formatDay(row.startDate, locale)}
                      {row.endDate !== row.startDate && ` – ${formatDay(row.endDate, locale)}`} ·{" "}
                      {t("absences.daysLabel", { count: row.days })}
                    </span>
                  </p>
                  {row.note && <p className="text-xs text-muted-foreground">{row.note}</p>}
                </div>
                {actions({ kind: "absence", id: row._id })}
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.corrections.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t("admin.corrections")}</h3>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
            {data.corrections.map((row) => (
              <li
                key={row._id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">
                    {row.person?.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {formatDay(row.date, locale)}
                    </span>
                  </p>
                  <p className="text-xs tabular-nums">
                    <span className="font-medium">
                      {t(`entries.request.${row.correctionAction ?? "add"}`)}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      ({t(row.kind === "work" ? "entries.kindWork" : "entries.kindBreak")})
                    </span>{" "}
                    {row.original && row.correctionAction === "edit" && (
                      <span className="text-muted-foreground line-through">
                        {formatClock(row.original.start, locale)}–
                        {row.original.end ? formatClock(row.original.end, locale) : ""}
                      </span>
                    )}{" "}
                    {formatClock(row.start, locale)}–{row.end ? formatClock(row.end, locale) : ""}
                  </p>
                  {row.reason && <p className="text-xs text-muted-foreground">{row.reason}</p>}
                </div>
                {actions({ kind: "entry", id: row._id })}
              </li>
            ))}
          </ul>
        </section>
      )}
      <ResponsiveDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && setRejecting(null)}
        title={t("admin.rejectTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => rejecting && void decide(rejecting, false, note.trim() || undefined)}
            >
              {t("admin.reject")}
            </Button>
          </>
        }
      >
        <FieldLabel htmlFor="reject-note">{t("admin.rejectNote")}</FieldLabel>
        <Textarea
          id="reject-note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </ResponsiveDialog>
    </div>
  );
}

type HolidayRow = { _id: Id<"holidays">; date: string; name: string; fraction: number };

function Holidays() {
  const t = useTranslations("Zeiterfassung");
  const locale = useLocale();
  const today = useBerlinToday();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const rows = useQuery(api.time.holidays.list, { year });
  const seed = useMutation(api.time.holidays.seedYear);
  const remove = useMutation(api.time.holidays.remove);
  const showError = useTimeErrorToast();
  const [editing, setEditing] = useState<HolidayRow | "new" | null>(null);

  async function runSeed() {
    try {
      const added = await seed({ year });
      toast.success(t("admin.holidaysSeeded", { count: added }));
    } catch (error) {
      showError(error);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[-1, 0, 1, 2].map((offset) => {
              const value = Number(today.slice(0, 4)) + offset;
              return (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void runSeed()}>
            <CalendarPlus />
            {t("admin.seedHolidays", { year })}
          </Button>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus />
            {t("admin.addHoliday")}
          </Button>
        </div>
      </div>
      {rows === undefined ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus />}
          title={t("admin.noHolidays", { year })}
          description={t("admin.noHolidaysHint")}
        />
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
          {rows
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((row) => (
              <li key={row._id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-28 shrink-0 text-sm tabular-nums text-muted-foreground">
                  {formatDay(row.date, locale, {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.name}</span>
                {row.fraction < 1 && <Chip>{t("admin.halfDay")}</Chip>}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("entries.edit")}
                  onClick={() => setEditing(row)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("entries.delete")}
                  onClick={() =>
                    void remove({ id: row._id })
                      .then(() => toast.success(t("admin.holidayRemoved")))
                      .catch(showError)
                  }
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
        </ul>
      )}
      <HolidayDialog
        holiday={editing}
        year={year}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </div>
  );
}

function HolidayDialog({
  holiday,
  year,
  onOpenChange,
}: {
  holiday: HolidayRow | "new" | null;
  year: number;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Zeiterfassung");
  const save = useMutation(api.time.holidays.save);
  const showError = useTimeErrorToast();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [fraction, setFraction] = useState<"1" | "0.5">("1");

  useEffect(() => {
    if (!holiday) return;
    const row = holiday === "new" ? null : holiday;
    setDate(row?.date ?? `${year}-01-01`);
    setName(row?.name ?? "");
    setFraction(row && row.fraction < 1 ? "0.5" : "1");
  }, [holiday, year]);

  async function submit() {
    try {
      await save({
        id: holiday && holiday !== "new" ? holiday._id : undefined,
        date,
        name,
        fraction: fraction === "1" ? 1 : 0.5,
      });
      toast.success(t("admin.holidaySaved"));
      onOpenChange(false);
    } catch (error) {
      showError(error);
    }
  }

  return (
    <ResponsiveDialog
      open={holiday !== null}
      onOpenChange={onOpenChange}
      title={holiday === "new" ? t("admin.addHoliday") : t("admin.editHoliday")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!date || !name.trim()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <FieldLabel htmlFor="holiday-date">{t("entries.date")}</FieldLabel>
          <Input
            id="holiday-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <div>
          <FieldLabel htmlFor="holiday-name">{t("admin.holidayName")}</FieldLabel>
          <Input id="holiday-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div>
          <FieldLabel>{t("admin.holidayLength")}</FieldLabel>
          <Select value={fraction} onValueChange={(value) => setFraction(value as "1" | "0.5")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">{t("admin.fullDay")}</SelectItem>
              <SelectItem value="0.5">{t("admin.halfDay")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function Locks() {
  const t = useTranslations("Zeiterfassung");
  const locale = useLocale();
  const rows = useQuery(api.time.locks.list);
  const lock = useMutation(api.time.locks.lock);
  const unlock = useMutation(api.time.locks.unlock);
  const showError = useTimeErrorToast();
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (rows === undefined) return <Skeleton className="h-48 rounded-xl" />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("admin.locksHint")}</p>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
        {rows.map((row) => {
          const reopened = !row.locked && row.unlockedAt !== null;
          return (
            <li key={row.month} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="w-40 shrink-0 text-sm font-medium">
                {formatMonth(row.month, locale)}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
                {row.locked ? (
                  <>
                    <Lock className="size-3.5" />
                    {t("admin.lockedState")}
                  </>
                ) : reopened ? (
                  <Chip tone="warn" hint={row.reason ?? undefined}>
                    <LockOpen className="size-3" />
                    {t("admin.unlockedState")}
                  </Chip>
                ) : (
                  t("admin.locksOn", {
                    date: formatDay(berlinDate(row.boundary), locale, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    }),
                  })
                )}
              </span>
              {row.locked ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReason("");
                    setUnlocking(row.month);
                  }}
                >
                  <LockOpen />
                  {t("admin.unlock")}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void lock({ month: row.month })
                      .then(() => toast.success(t("admin.lockDone")))
                      .catch(showError)
                  }
                >
                  <Lock />
                  {t("admin.lock")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <ResponsiveDialog
        open={unlocking !== null}
        onOpenChange={(open) => !open && setUnlocking(null)}
        title={t("admin.unlockTitle", { month: unlocking ? formatMonth(unlocking, locale) : "" })}
        description={t("admin.unlockHint")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setUnlocking(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!reason.trim()}
              onClick={() =>
                unlocking &&
                void unlock({ month: unlocking, reason })
                  .then(() => {
                    toast.success(t("admin.unlockDone"));
                    setUnlocking(null);
                  })
                  .catch(showError)
              }
            >
              {t("admin.unlock")}
            </Button>
          </>
        }
      >
        <FieldLabel htmlFor="unlock-reason">{t("admin.unlockReason")}</FieldLabel>
        <Textarea
          id="unlock-reason"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </ResponsiveDialog>
    </div>
  );
}

export function AuditLog({ userId }: { userId?: Id<"users"> }) {
  const t = useTranslations("Zeiterfassung");
  const locale = useLocale();
  const rows = useQuery(api.time.admin.auditLog, { userId, limit: 150 });
  const [open, setOpen] = useState<string | null>(null);
  const known = useMemo(
    () =>
      new Set([
        "clockIn",
        "clockOut",
        "breakStart",
        "breakEnd",
        "autoClose",
        "create",
        "update",
        "delete",
        "requestCorrection",
        "withdrawCorrection",
        "approveCorrection",
        "rejectCorrection",
        "request",
        "createApproved",
        "approve",
        "reject",
        "cancel",
        "seed",
        "lock",
        "unlock",
        "autoLock",
        "carryOver",
        "expireCarryOver",
      ]),
    [],
  );

  if (rows === undefined) return <Skeleton className="h-48 rounded-xl" />;
  if (rows.length === 0) return <EmptyState icon={<ScrollText />} title={t("admin.auditEmpty")} />;

  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
      {rows.map((row) => (
        <li key={row._id} className="px-4 py-2.5 text-sm">
          <button
            type="button"
            className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
            onClick={() => setOpen(open === row._id ? null : row._id)}
            aria-expanded={open === row._id}
          >
            <span className="w-32 shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatDay(berlinDate(row.at), locale, { day: "2-digit", month: "2-digit" })}{" "}
              {formatClock(row.at, locale)}
            </span>
            <span className="font-medium">
              {known.has(row.action) ? t(`audit.action.${row.action}`) : row.action}
            </span>
            <span className="text-muted-foreground">{t(`audit.entity.${row.entity}`)}</span>
            {row.subjectName && <span className="truncate">{row.subjectName}</span>}
            <span className="ml-auto text-xs text-muted-foreground">
              {row.actorName ?? t("audit.system")}
            </span>
          </button>
          {row.reason && <p className="mt-1 text-xs text-muted-foreground">„{row.reason}“</p>}
          {open === row._id && (
            <div className="mt-2 grid gap-2 text-[11px] md:grid-cols-2">
              <pre className="overflow-x-auto rounded-md bg-muted/50 p-2">
                {t("audit.before")}: {JSON.stringify(row.before ?? null, null, 2)}
              </pre>
              <pre className="overflow-x-auto rounded-md bg-muted/50 p-2">
                {t("audit.after")}: {JSON.stringify(row.after ?? null, null, 2)}
              </pre>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
