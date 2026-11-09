"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { addDays, berlinDate, datesBetween } from "@advantis/convex/time";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { AlertTriangle, Check, CookingPot, Repeat2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidePanelProperties, SidePanelSection } from "@/components/ui/side-panel";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

export type KitchenDuty = FunctionReturnType<typeof api.kitchen.forRange>[number];

type UserId = Id<"users">;

/** Orange sets kitchen duty apart from events, appointments and absences. */
export const KITCHEN_CHIP =
  "bg-orange-500/15 text-orange-700 hover:bg-orange-500/25 dark:text-orange-300";
export const KITCHEN_DOT = "bg-orange-500";
export const KITCHEN_ACCENT = "var(--color-orange-500)";

const NONE = "none";
const MAX_DAYS = 92;
const DEFAULT_DAYS = 28;

function useDayLabel() {
  const locale = useLocale();
  return (date: string) =>
    new Date(`${date}T12:00`).toLocaleDateString(locale, {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    });
}

export function KitchenChip({ duty, onOpen }: { duty: KitchenDuty; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(ev) => {
        ev.stopPropagation();
        onOpen();
      }}
      onKeyDown={(ev) => {
        if (ev.key === "Enter") {
          ev.stopPropagation();
          onOpen();
        }
      }}
      className={cn(
        "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] font-medium",
        KITCHEN_CHIP,
        duty.isMine && "ring-1 ring-inset ring-orange-500/60",
      )}
      title={duty.name}
    >
      {duty.cannotDo ? (
        <AlertTriangle className="size-3 shrink-0" />
      ) : (
        <CookingPot className="size-3 shrink-0 opacity-70" />
      )}
      <span className="truncate">{duty.name}</span>
    </div>
  );
}

/** Admins review the rotation's proposal, change single days, then save. */
export function KitchenPlanDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Calendar.kitchen");
  const tc = useTranslations("Common");
  const dayLabel = useDayLabel();
  const handleError = useErrorHandler();
  const options = useQuery(api.kitchen.planOptions, open ? {} : "skip");
  const save = useMutation(api.kitchen.savePlan);
  const today = berlinDate(Date.now());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(() => addDays(today, DEFAULT_DAYS - 1));
  const [memberIds, setMemberIds] = useState<UserId[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) return;
    setMemberIds(null);
    setOverrides({});
  }, [open]);

  const members = useMemo(
    () => memberIds ?? options?.filter((p) => p.selected).map((p) => p.userId) ?? [],
    [memberIds, options],
  );
  const names = useMemo(() => new Map(options?.map((p) => [p.userId, p.name])), [options]);

  // The server refuses these periods; a query that throws would take the page down.
  const validPeriod =
    !!from && !!to && from >= today && to >= from && datesBetween(from, to).length <= MAX_DAYS;
  const days = useQuery(
    api.kitchen.preview,
    open && validPeriod && members.length > 0 ? { from, to, memberIds: members } : "skip",
  );

  const chosen = (day: NonNullable<typeof days>[number]) => {
    const override = overrides[day.date];
    if (override === NONE) return null;
    return (override as UserId | undefined) ?? day.userId;
  };

  function toggle(userId: UserId) {
    setMemberIds(
      members.includes(userId) ? members.filter((id) => id !== userId) : [...members, userId],
    );
    setOverrides({});
  }

  async function submit() {
    if (!days) return;
    setBusy(true);
    try {
      const planned = days.flatMap((day) => {
        const userId = chosen(day);
        return userId ? [{ date: day.date, userId }] : [];
      });
      const { changed } = await save({ from, to, memberIds: members, days: planned });
      toast.success(t("planSaved", { count: changed }));
      onOpenChange(false);
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("planTitle")}
      description={t("planHint")}
      contentClassName="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!days || days.length === 0 || busy}>
            {t("savePlan")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="kitchen-from">{t("from")}</Label>
            <Input
              id="kitchen-from"
              type="date"
              min={today}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kitchen-to">{t("to")}</Label>
            <Input
              id="kitchen-to"
              type="date"
              min={from}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        {!validPeriod && <p className="text-sm text-destructive">{t("tooLong")}</p>}

        <div className="space-y-2">
          <Label>{t("people")}</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {options?.map((person) => {
              const selected = members.includes(person.userId);
              return (
                <button
                  key={person.userId}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggle(person.userId)}
                  className={cn(
                    "flex min-h-9 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                    selected ? "border-orange-500/40 bg-orange-500/10" : "border-border/70",
                  )}
                >
                  <Check className={cn("size-3.5 shrink-0", !selected && "invisible")} />
                  <span className="min-w-0 truncate">{person.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {days && (
          <div className="space-y-2">
            <Label>{t("proposal")}</Label>
            {days.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noDays")}</p>
            ) : (
              <ul className="space-y-1">
                {days.map((day) => (
                  <li key={day.date} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-sm tabular-nums">{dayLabel(day.date)}</span>
                    <Select
                      value={chosen(day) ?? NONE}
                      onValueChange={(value) =>
                        setOverrides((current) => ({ ...current, [day.date]: value }))
                      }
                    >
                      <SelectTrigger className="h-9 flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{t("nobody")}</SelectItem>
                        {day.candidates.map((userId) => (
                          <SelectItem key={userId} value={userId}>
                            {names.get(userId) ?? ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}

function KitchenSwapDialog({
  date,
  onOpenChange,
}: {
  date: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Calendar.kitchen");
  const tc = useTranslations("Common");
  const dayLabel = useDayLabel();
  const handleError = useErrorHandler();
  const options = useQuery(api.kitchen.swapOptions, date ? { date } : "skip");
  const request = useMutation(api.kitchen.requestSwap);
  const [toUserId, setToUserId] = useState<string>("");
  const [otherDate, setOtherDate] = useState(NONE);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToUserId("");
    setOtherDate(NONE);
  }, [date]);

  const colleague = options?.find((person) => person.userId === toUserId);

  async function submit() {
    if (!date || !colleague) return;
    setBusy(true);
    try {
      await request({
        date,
        toUserId: colleague.userId,
        otherDate: otherDate === NONE ? undefined : otherDate,
      });
      toast.success(t("swapSent"));
      onOpenChange(false);
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      open={date !== null}
      onOpenChange={onOpenChange}
      title={t("swapTitle")}
      description={date ? t("swapHint", { date: dayLabel(date) }) : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!colleague || busy}>
            {t("sendSwap")}
          </Button>
        </>
      }
    >
      {options?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noColleagues")}</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("colleague")}</Label>
            <Select
              value={toUserId}
              onValueChange={(value) => {
                setToUserId(value);
                setOtherDate(NONE);
              }}
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder={t("chooseColleague")} />
              </SelectTrigger>
              <SelectContent>
                {options?.map((person) => (
                  <SelectItem key={person.userId} value={person.userId}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {colleague && colleague.days.length > 0 && (
            <div className="space-y-2">
              <Label>{t("otherDay")}</Label>
              <Select value={otherDate} onValueChange={setOtherDate}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("noOtherDay")}</SelectItem>
                  {colleague.days.map((day) => (
                    <SelectItem key={day} value={day}>
                      {dayLabel(day)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </ResponsiveDialog>
  );
}

export function KitchenDetails({
  duty,
  isAdmin,
  onCleared,
}: {
  duty: KitchenDuty;
  isAdmin: boolean;
  onCleared: () => void;
}) {
  const t = useTranslations("Calendar.kitchen");
  const handleError = useErrorHandler();
  const options = useQuery(api.kitchen.planOptions, isAdmin ? {} : "skip");
  const setDay = useMutation(api.kitchen.setDay);
  const [swapDate, setSwapDate] = useState<string | null>(null);

  async function reassign(value: string) {
    try {
      await setDay({ date: duty.date, userId: value === NONE ? null : (value as UserId) });
      if (value === NONE) onCleared();
    } catch (error) {
      handleError(error);
    }
  }

  const selectable = options?.filter((p) => p.selected || p.userId === duty.userId);

  return (
    <>
      <SidePanelSection title={t("section")}>
        <SidePanelProperties
          rows={[
            { label: t("who"), value: duty.name },
            { label: t("when"), value: t("beforeClosing") },
          ]}
        />
        {duty.cannotDo && (
          <p className="mt-3 flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {t("cannotDo")}
          </p>
        )}
        {duty.swapPending && (
          <p className="mt-3 text-sm text-muted-foreground">{t("swapPending")}</p>
        )}
      </SidePanelSection>

      {!duty.past && (duty.isMine || isAdmin) && (
        <SidePanelSection title={t("change")}>
          <div className="space-y-3">
            {isAdmin && selectable && (
              <Select value={duty.userId} onValueChange={(value) => void reassign(value)}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("nobody")}</SelectItem>
                  {selectable.map((person) => (
                    <SelectItem key={person.userId} value={person.userId}>
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {duty.isMine && !duty.swapPending && (
              <Button variant="outline" size="sm" onClick={() => setSwapDate(duty.date)}>
                <Repeat2 />
                {t("swapButton")}
              </Button>
            )}
          </div>
        </SidePanelSection>
      )}

      <KitchenSwapDialog date={swapDate} onOpenChange={(open) => !open && setSwapDate(null)} />
    </>
  );
}

/** Swap requests waiting for the viewer, and the viewer's own open ones. */
export function KitchenInbox() {
  const t = useTranslations("Calendar.kitchen");
  const dayLabel = useDayLabel();
  const handleError = useErrorHandler();
  const inbox = useQuery(api.kitchen.inbox);
  const answer = useMutation(api.kitchen.answerSwap);
  const cancel = useMutation(api.kitchen.cancelSwap);
  if (!inbox || (inbox.toAnswer.length === 0 && inbox.mine.length === 0)) return null;

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action();
      toast.success(done);
    } catch (error) {
      handleError(error);
    }
  }

  return (
    <div className="mb-4 grid gap-3 md:grid-cols-2">
      {inbox.toAnswer.length > 0 && (
        <section className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-3">
          <h3 className="px-2 pb-1 text-sm font-semibold">
            {t("toAnswer", { count: inbox.toAnswer.length })}
          </h3>
          <ul>
            {inbox.toAnswer.map((swap) => (
              <li key={swap._id} className="flex flex-wrap items-center gap-2 px-2 py-1.5">
                <span className="min-w-0 flex-1 text-sm">
                  {swap.otherDate
                    ? t("askTrade", {
                        name: swap.fromName,
                        date: dayLabel(swap.date),
                        otherDate: dayLabel(swap.otherDate),
                      })
                    : t("askTakeOver", { name: swap.fromName, date: dayLabel(swap.date) })}
                </span>
                <Button
                  size="xs"
                  onClick={() =>
                    void run(() => answer({ id: swap._id, accept: true }), t("accepted"))
                  }
                >
                  {t("accept")}
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    void run(() => answer({ id: swap._id, accept: false }), t("declined"))
                  }
                >
                  {t("decline")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {inbox.mine.length > 0 && (
        <section className="rounded-xl border border-border/70 bg-card p-3">
          <h3 className="px-2 pb-1 text-sm font-semibold">
            {t("myRequests", { count: inbox.mine.length })}
          </h3>
          <ul>
            {inbox.mine.map((swap) => (
              <li key={swap._id} className="flex items-center gap-2 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {t("waitingFor", { date: dayLabel(swap.date), name: swap.toName })}
                </span>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => void run(() => cancel({ id: swap._id }), t("withdrawn"))}
                >
                  {t("withdraw")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
