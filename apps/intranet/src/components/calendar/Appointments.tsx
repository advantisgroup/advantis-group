"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { format } from "date-fns";
import { Check, CalendarClock, Clock, Pencil, UserRound, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { PersonAvatar, PersonPicker, type PersonOption } from "@/components/people/PersonPicker";
import { PersonLink } from "@/components/profile/PersonLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { SidePanelProperties, SidePanelSection } from "@/components/ui/side-panel";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Appointment = FunctionReturnType<typeof api.appointments.listForRange>[number];

/** Violet sets appointments apart from company events and absences. */
export const APPOINTMENT_CHIP =
  "bg-violet-500/15 text-violet-700 hover:bg-violet-500/25 dark:text-violet-300";
export const APPOINTMENT_DOT = "bg-violet-500";
export const APPOINTMENT_ACCENT = "var(--color-violet-500)";

export interface AppointmentDraft {
  id?: Id<"appointments">;
  mode: "book" | "request";
  attendeeIds: Id<"users">[];
  organizerId: Id<"users"> | null;
  title: string;
  note: string;
  location: string;
  date: string;
  from: string;
  to: string;
}

export function newAppointmentDraft(mode: "book" | "request", date: string): AppointmentDraft {
  return {
    mode,
    attendeeIds: [],
    organizerId: null,
    title: "",
    note: "",
    location: "",
    date,
    from: "10:00",
    to: "10:30",
  };
}

export function draftFromAppointment(a: Appointment): AppointmentDraft {
  return {
    id: a._id,
    mode: "book",
    attendeeIds: a.attendees.map((p) => p.userId),
    organizerId: a.organizer.userId,
    title: a.title,
    note: a.note ?? "",
    location: a.location ?? "",
    date: format(new Date(a.start), "yyyy-MM-dd"),
    from: format(new Date(a.start), "HH:mm"),
    to: format(new Date(a.end), "HH:mm"),
  };
}

const toMs = (date: string, time: string) => new Date(`${date}T${time}`).getTime();

/** Who an appointment is with, from the viewer's side. */
export function counterpart(a: Appointment): string {
  if (a.isOrganizer) return a.attendees.map((p) => p.name).join(", ");
  return a.organizer.name;
}

export function AppointmentChip({
  appointment,
  onOpen,
}: {
  appointment: Appointment;
  onOpen: () => void;
}) {
  const requested = appointment.status === "requested";
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
        APPOINTMENT_CHIP,
        requested && "border border-dashed border-violet-500/60 bg-transparent",
      )}
      title={`${appointment.title} · ${counterpart(appointment)}`}
    >
      <span className="tabular-nums opacity-70">
        {format(new Date(appointment.start), "HH:mm")}
      </span>
      <span className="truncate">{appointment.title}</span>
    </div>
  );
}

/** Create, change or request an appointment. */
export function AppointmentDialog({
  draft,
  onOpenChange,
}: {
  draft: AppointmentDraft | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Calendar.appt");
  const tc = useTranslations("Common");
  const handleError = useErrorHandler();
  const contacts = useQuery(api.appointments.contacts, draft ? {} : "skip");
  const options = useQuery(api.people.users.options, draft ? {} : "skip");
  const create = useMutation(api.appointments.create);
  const update = useMutation(api.appointments.update);
  const request = useMutation(api.appointments.request);
  const [form, setForm] = useState<AppointmentDraft | null>(draft);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(draft);
  }, [draft]);

  const byId = useMemo(() => new Map((options ?? []).map((p) => [p.userId, p])), [options]);
  const pick = (ids: { userId: Id<"users"> }[] | undefined) =>
    ids?.map((p) => byId.get(p.userId)).filter((p): p is PersonOption => !!p);
  const attendeeOptions = pick(contacts?.attendees);
  const recipientOptions = pick(contacts?.recipients);

  if (!form) return null;

  const set = (patch: Partial<AppointmentDraft>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const canBook = !!contacts?.isLead;
  const canRequest = (contacts?.recipients.length ?? 0) > 0;
  const editing = !!form.id;
  const mode = editing ? "book" : form.mode;
  const valid =
    form.title.trim().length > 0 &&
    !!form.date &&
    !!form.from &&
    !!form.to &&
    form.to > form.from &&
    (mode === "book" ? form.attendeeIds.length > 0 : !!form.organizerId);

  async function submit() {
    if (!form || !valid) return;
    setBusy(true);
    const start = toMs(form.date, form.from);
    const end = toMs(form.date, form.to);
    try {
      if (form.id) {
        await update({
          id: form.id,
          title: form.title,
          note: form.note || undefined,
          location: form.location || undefined,
          start,
          end,
          attendeeIds: form.attendeeIds,
        });
        toast.success(t("saved"));
      } else if (mode === "book") {
        await create({
          attendeeIds: form.attendeeIds,
          title: form.title,
          note: form.note || undefined,
          location: form.location || undefined,
          start,
          end,
        });
        toast.success(t("booked"));
      } else {
        await request({
          organizerId: form.organizerId!,
          title: form.title,
          note: form.note || undefined,
          start,
          end,
        });
        toast.success(t("requested"));
      }
      onOpenChange(false);
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      open={draft !== null}
      onOpenChange={onOpenChange}
      title={editing ? t("editTitle") : mode === "book" ? t("bookTitle") : t("requestTitle")}
      description={mode === "book" ? t("bookHint") : t("requestHint")}
      contentClassName="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!valid || busy}>
            {editing ? tc("save") : mode === "book" ? t("book") : t("send")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!editing && canBook && canRequest && (
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-border/70 bg-muted/50 p-1">
            {(["book", "request"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => set({ mode: value })}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  mode === value
                    ? "bg-card shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value === "book" ? t("modeBook") : t("modeRequest")}
              </button>
            ))}
          </div>
        )}

        {mode === "book" ? (
          <div className="space-y-2">
            <Label>{t("with")}</Label>
            {form.attendeeIds.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {form.attendeeIds.map((id) => {
                  const person = byId.get(id);
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card py-0.5 pl-0.5 pr-1.5 text-sm"
                    >
                      {person && <PersonAvatar person={person} className="size-5" />}
                      <span>{person?.name ?? "…"}</span>
                      <button
                        type="button"
                        aria-label={tc("remove")}
                        onClick={() =>
                          set({ attendeeIds: form.attendeeIds.filter((x) => x !== id) })
                        }
                        className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <PersonPicker
              value={null}
              people={attendeeOptions}
              exclude={form.attendeeIds}
              placeholder={form.attendeeIds.length ? t("addPerson") : t("choosePerson")}
              label={t("with")}
              onChange={(userId) =>
                userId && set({ attendeeIds: [...new Set([...form.attendeeIds, userId])] })
              }
            />
            {contacts && !contacts.isLead && (
              <p className="text-xs text-muted-foreground">{t("onlyLeads")}</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label>{t("askWho")}</Label>
            <PersonPicker
              value={form.organizerId}
              people={recipientOptions}
              placeholder={t("choosePerson")}
              label={t("askWho")}
              onChange={(userId) => set({ organizerId: userId })}
            />
            <p className="text-xs text-muted-foreground">{t("askWhoHint")}</p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="appt-title">{t("topic")}</Label>
          <Input
            id="appt-title"
            value={form.title}
            placeholder={t("topicPlaceholder")}
            onChange={(e) => set({ title: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <div className="space-y-2">
            <Label htmlFor="appt-date">{t("date")}</Label>
            <Input
              id="appt-date"
              type="date"
              value={form.date}
              onChange={(e) => set({ date: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="appt-from">{t("from")}</Label>
            <Input
              id="appt-from"
              type="time"
              step={300}
              value={form.from}
              onChange={(e) => {
                const from = e.target.value;
                set({ from, ...(form.to <= from ? { to: plus30(from) } : {}) });
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="appt-to">{t("to")}</Label>
            <Input
              id="appt-to"
              type="time"
              step={300}
              value={form.to}
              onChange={(e) => set({ to: e.target.value })}
            />
          </div>
        </div>

        {mode === "book" && (
          <div className="space-y-2">
            <Label htmlFor="appt-location">{t("location")}</Label>
            <Input
              id="appt-location"
              value={form.location}
              placeholder={t("locationPlaceholder")}
              onChange={(e) => set({ location: e.target.value })}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="appt-note">{t("note")}</Label>
          <Textarea
            id="appt-note"
            rows={2}
            value={form.note}
            onChange={(e) => set({ note: e.target.value })}
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function plus30(time: string) {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(h * 60 + m + 30, 23 * 60 + 55);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

type ReasonAction = "decline" | "reject" | "cancel" | "withdraw";

/** The appointment's side panel body: who, where, and what the viewer can do. */
export function AppointmentDetails({
  appointment,
  myId,
  isAdmin,
  onEdit,
  onDone,
}: {
  appointment: Appointment;
  myId: Id<"users">;
  isAdmin: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("Calendar.appt");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const handleError = useErrorHandler();
  const respond = useMutation(api.appointments.respond);
  const decline = useMutation(api.appointments.decline);
  const cancel = useMutation(api.appointments.cancel);
  const [reason, setReason] = useState<{ action: ReasonAction; text: string } | null>(null);
  const [moving, setMoving] = useState<{ date: string; from: string; to: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const a = appointment;
  const requested = a.status === "requested";
  const canManage = a.isOrganizer || isAdmin;
  const mine = a.attendees.find((p) => p.userId === myId);

  async function run(fn: () => Promise<unknown>, message: string, close = false) {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      setReason(null);
      setMoving(null);
      if (close) onDone();
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  function submitReason() {
    if (!reason) return;
    const text = reason.text.trim();
    if (reason.action === "decline") {
      void run(() => decline({ id: a._id, reason: text }), t("declinedToast"));
    } else if (reason.action === "reject") {
      void run(() => respond({ id: a._id, accept: false, note: text }), t("rejectedToast"), true);
    } else {
      void run(
        () => cancel({ id: a._id, reason: text || undefined }),
        reason.action === "withdraw" ? t("withdrawnToast") : t("cancelledToast"),
        true,
      );
    }
  }

  const reasonRequired = reason?.action === "decline" || reason?.action === "reject";
  const when = `${new Date(a.start).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  })} · ${formatTime(a.start, locale)} – ${formatTime(a.end, locale)}`;

  return (
    <>
      <SidePanelSection title={t("details")}>
        <SidePanelProperties
          rows={[
            { label: t("when"), value: when },
            {
              label: t("organizer"),
              value: <PersonLink userId={a.organizer.userId}>{a.organizer.name}</PersonLink>,
            },
            {
              label: t("with"),
              value: (
                <ul className="space-y-1">
                  {a.attendees.map((p) => (
                    <li key={p.userId}>
                      <PersonLink userId={p.userId}>{p.name}</PersonLink>
                      {p.declined && (
                        <span className="block text-xs text-destructive">
                          {t("cantMake", { reason: p.declined })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ),
            },
            ...(a.location ? [{ label: t("location"), value: a.location }] : []),
            {
              label: t("status"),
              value: requested ? t("statusRequested") : t("statusConfirmed"),
            },
          ]}
        />
      </SidePanelSection>
      {a.note && (
        <SidePanelSection title={t("note")}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{a.note}</p>
        </SidePanelSection>
      )}
      {a.decisionNote && !requested && (
        <SidePanelSection title={t("answer")}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{a.decisionNote}</p>
        </SidePanelSection>
      )}

      <SidePanelSection title={t("actions")}>
        <div className="flex flex-wrap gap-2">
          {requested && canManage && (
            <>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(() => respond({ id: a._id, accept: true }), t("acceptedToast"))
                }
              >
                <Check />
                {t("accept")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  setMoving({
                    date: format(new Date(a.start), "yyyy-MM-dd"),
                    from: format(new Date(a.start), "HH:mm"),
                    to: format(new Date(a.end), "HH:mm"),
                  })
                }
              >
                <Clock />
                {t("otherTime")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setReason({ action: "reject", text: "" })}
              >
                <X />
                {t("reject")}
              </Button>
            </>
          )}
          {requested && a.requestedBy === myId && !canManage && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setReason({ action: "withdraw", text: "" })}
            >
              <X />
              {t("withdraw")}
            </Button>
          )}
          {!requested && canManage && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={onEdit}>
                <Pencil />
                {tc("edit")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => setReason({ action: "cancel", text: "" })}
              >
                <X />
                {t("cancelAppointment")}
              </Button>
            </>
          )}
          {!requested && mine && !mine.declined && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setReason({ action: "decline", text: "" })}
            >
              <X />
              {t("cantMakeIt")}
            </Button>
          )}
        </div>
      </SidePanelSection>

      <ResponsiveDialog
        open={reason !== null}
        onOpenChange={(open) => !open && setReason(null)}
        title={
          reason?.action === "decline"
            ? t("cantMakeIt")
            : reason?.action === "reject"
              ? t("reject")
              : reason?.action === "withdraw"
                ? t("withdraw")
                : t("cancelAppointment")
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setReason(null)}>
              {tc("cancel")}
            </Button>
            <Button
              onClick={submitReason}
              disabled={busy || (reasonRequired && !reason?.text.trim())}
            >
              {t("confirm")}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="appt-reason">{reasonRequired ? t("reason") : t("reasonOptional")}</Label>
          <Textarea
            id="appt-reason"
            rows={3}
            value={reason?.text ?? ""}
            onChange={(e) => setReason((r) => (r ? { ...r, text: e.target.value } : r))}
          />
          <p className="text-xs text-muted-foreground">{t("reasonHint")}</p>
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={moving !== null}
        onOpenChange={(open) => !open && setMoving(null)}
        title={t("otherTime")}
        description={t("otherTimeHint")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoving(null)}>
              {tc("cancel")}
            </Button>
            <Button
              disabled={busy || !moving || !moving.date || moving.to <= moving.from}
              onClick={() =>
                moving &&
                void run(
                  () =>
                    respond({
                      id: a._id,
                      accept: true,
                      start: toMs(moving.date, moving.from),
                      end: toMs(moving.date, moving.to),
                    }),
                  t("acceptedToast"),
                )
              }
            >
              {t("acceptAtTime")}
            </Button>
          </>
        }
      >
        {moving && (
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <div className="space-y-2">
              <Label htmlFor="move-date">{t("date")}</Label>
              <Input
                id="move-date"
                type="date"
                value={moving.date}
                onChange={(e) => setMoving({ ...moving, date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="move-from">{t("from")}</Label>
              <Input
                id="move-from"
                type="time"
                step={300}
                value={moving.from}
                onChange={(e) => setMoving({ ...moving, from: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="move-to">{t("to")}</Label>
              <Input
                id="move-to"
                type="time"
                step={300}
                value={moving.to}
                onChange={(e) => setMoving({ ...moving, to: e.target.value })}
              />
            </div>
          </div>
        )}
      </ResponsiveDialog>
    </>
  );
}

/** Open requests above the calendar: ones waiting for the viewer, and their own. */
export function AppointmentInbox({ onOpen }: { onOpen: (a: Appointment) => void }) {
  const t = useTranslations("Calendar.appt");
  const locale = useLocale();
  const inbox = useQuery(api.appointments.inbox);
  if (!inbox || (inbox.toAnswer.length === 0 && inbox.mine.length === 0)) return null;

  const row = (a: Appointment, label: string) => (
    <li key={a._id}>
      <button
        type="button"
        onClick={() => onOpen(a)}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-violet-500/15 text-violet-700 dark:text-violet-300">
          {a.isOrganizer ? <UserRound className="size-4" /> : <CalendarClock className="size-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{a.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {label} ·{" "}
            {new Date(a.start).toLocaleDateString(locale, {
              weekday: "short",
              day: "2-digit",
              month: "2-digit",
            })}{" "}
            {formatTime(a.start, locale)}
          </span>
        </span>
      </button>
    </li>
  );

  return (
    <div className="mb-4 grid gap-3 md:grid-cols-2">
      {inbox.toAnswer.length > 0 && (
        <section className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
          <h3 className="px-2 pb-1 text-sm font-semibold">
            {t("toAnswer", { count: inbox.toAnswer.length })}
          </h3>
          <ul>{inbox.toAnswer.map((a) => row(a, a.attendees.map((p) => p.name).join(", ")))}</ul>
        </section>
      )}
      {inbox.mine.length > 0 && (
        <section className="rounded-xl border border-border/70 bg-card p-3">
          <h3 className="px-2 pb-1 text-sm font-semibold">
            {t("myRequests", { count: inbox.mine.length })}
          </h3>
          <ul>{inbox.mine.map((a) => row(a, t("waitingFor", { name: a.organizer.name })))}</ul>
        </section>
      )}
    </div>
  );
}
