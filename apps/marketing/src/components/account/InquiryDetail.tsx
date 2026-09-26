"use client";

import { useRef, useState } from "react";

import { buildIcs, replyDueAt } from "@advantis/convex/marketing/inquiry";
import { CalendarPlus, Check, Copy, Mail, Paperclip, Printer, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Display } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { useTrackEvent, useTrackOnce } from "@/lib/analytics";
import { api } from "@/lib/eden";
import type { InquiryDetail as InquiryDetailData } from "@/lib/inquiries-server";
import { cn } from "@/lib/utils";

import { AccountBackLink } from "./AccountNav";
import { type Checkpoint, CheckpointNote, Checkpoints } from "./Checkpoints";
import { TYPE_ICON, isActive, isUpcomingCallback, useInquiryFormat } from "./inquiry-format";
import { StateLabel } from "./StateLabel";

type Detail = InquiryDetailData;
type Inquiry = Detail["inquiry"];
type Format = ReturnType<typeof useInquiryFormat>;
type T = ReturnType<typeof useTranslations<"account.inquiries">>;

const PHONE = process.env.NEXT_PUBLIC_PHONE_NUMBER;
const INBOX = process.env.NEXT_PUBLIC_EMAIL_ADRESS;
// a title longer than this reads as a paragraph in the serif, so the message leads instead
const TITLE_MAX = 90;

/**
 * One inquiry, on its own page: where it's at, whether both mails arrived,
 * what was sent, and the conversation since — with the few things a customer
 * can do about it (send again, withdraw, reply, add the callback to a calendar).
 */
export function InquiryDetail({ detail }: { detail: Detail }) {
  useTrackOnce("Account - Inquiry Opened", `inquiry:${detail.inquiry._id}`);
  const t = useTranslations("account.inquiries");
  const format = useInquiryFormat();
  const { inquiry } = detail;
  const Icon = TYPE_ICON[inquiry.submissionType];
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const { title, body } = headline(inquiry, format, t);

  return (
    <article className="max-w-3xl">
      <AccountBackLink href="/account/submissions" label={t("back")} />

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <Icon aria-hidden className="size-3.5" />
        <span>{format.type(inquiry)}</span>
        <span aria-hidden>·</span>
        <ReferenceChip reference={inquiry.reference} />
        <span aria-hidden>·</span>
        <time
          dateTime={new Date(inquiry.sentAt).toISOString()}
          title={format.full.format(inquiry.sentAt)}
        >
          {format.dateTime.format(inquiry.sentAt)}
        </time>
        <span aria-hidden>·</span>
        <StateLabel state={inquiry.state} />
      </p>
      <Display as="h1" size="sm" className="mt-3 [overflow-wrap:anywhere]">
        {title}
      </Display>
      <Checkpoints
        label={t("progressLabel")}
        steps={progressSteps(detail, format, t)}
        summary={statusLine(detail, format, t)}
        className="mt-8"
      >
        {/* it never reached us: that outranks everything else on the page */}
        {TROUBLE.has(inquiry.delivery.status) ? (
          <TeamNote inquiry={inquiry} format={format} />
        ) : null}
      </Checkpoints>

      {inquiry.submissionType === "callback" ? (
        <Callback inquiry={inquiry} format={format} />
      ) : null}

      <Conversation detail={detail} body={body} format={format} />
      <Composer inquiry={inquiry} composerRef={composerRef} />
      <Actions inquiry={inquiry} onNeedHelp={() => composerRef.current?.focus()} />

      <section className="mt-14 border-t border-rule pt-6">
        <h2 className="text-[15px] font-medium text-foreground">{t("details")}</h2>
        <Shared inquiry={inquiry} format={format} />
        <Delivery inquiry={inquiry} format={format} />
      </section>

      <div data-print-hide className="mt-10 flex flex-wrap gap-2 border-t border-rule pt-6">
        <Button variant="ghost" size="sm" onClick={() => window.print()}>
          <Printer />
          {t("print")}
        </Button>
        {INBOX ? (
          <Button asChild variant="ghost" size="sm">
            <a
              href={`mailto:${INBOX}?subject=${encodeURIComponent(`${inquiry.reference} · ${title}`)}`}
            >
              <Mail />
              {t("emailUs")}
            </a>
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function headline(inquiry: Inquiry, format: Format, t: T) {
  const { title } = format.title(inquiry);
  const body = inquiry.submissionType === "callback" ? inquiry.notes : inquiry.message;
  // a message is named by its first line, which reads as a paragraph in the serif when it's long
  return { title: title.length <= TITLE_MAX ? title : t("yourMessage"), body };
}

function progressSteps(detail: Detail, format: Format, t: T): Checkpoint[] {
  const { inquiry } = detail;
  const at = (value?: number) => (value ? format.dateTime.format(value) : undefined);
  const received: Checkpoint = {
    key: "received",
    label: t("steps.received"),
    meta: at(inquiry.sentAt),
    state: "done",
  };

  if (inquiry.state === "withdrawn") {
    const withdrawn = detail.events.findLast((event) => event.state === "withdrawn");
    return [
      received,
      { key: "withdrawn", label: t("steps.withdrawn"), meta: at(withdrawn?.at), state: "done" },
    ];
  }

  const reached = { open: 0, in_progress: 2, answered: 3, closed: 3 }[inquiry.state];
  const steps: Checkpoint[] = [
    received,
    {
      key: "seen",
      label: t("steps.seen"),
      meta: inquiry.seenAt
        ? detail.seenBy
          ? t("seenBy", { name: detail.seenBy, when: at(inquiry.seenAt)! })
          : at(inquiry.seenAt)
        : undefined,
      state: inquiry.seenAt || reached >= 2 ? "done" : "upcoming",
    },
    {
      key: "inProgress",
      label: t("steps.inProgress"),
      meta: detail.assignee ? t("onIt", { name: detail.assignee }) : undefined,
      state: inquiry.state === "in_progress" ? "current" : reached >= 3 ? "done" : "upcoming",
    },
    {
      key: "answered",
      label: t("steps.answered"),
      meta: at(inquiry.firstResponseAt),
      state: reached >= 3 ? "done" : "upcoming",
    },
  ];
  if (inquiry.state === "closed") {
    steps.push({
      key: "closed",
      label: t("steps.closed"),
      meta: at(inquiry.closedAt),
      state: "done",
    });
  }
  // while nobody has it yet, the step it's waiting on is where it is
  const waitingOn = steps.findIndex((step) => step.state === "upcoming");
  if (inquiry.state === "open" && waitingOn !== -1) {
    steps[waitingOn] = { ...steps[waitingOn], state: "current" };
  }
  return steps;
}

/** One sentence of where it stands and what happens next, inside the progress card. */
function statusLine(detail: Detail, format: Format, t: T) {
  const { inquiry } = detail;
  const at = (value: number | undefined) => (value ? format.full.format(value) : "");

  switch (inquiry.state) {
    case "withdrawn": {
      const withdrawn = detail.events.findLast((event) => event.state === "withdrawn");
      return t("status.withdrawn", { when: at(withdrawn?.at) });
    }
    case "closed":
      return t("status.closed", { when: at(inquiry.closedAt) });
    case "answered":
      return t("status.answered", { when: at(inquiry.firstResponseAt) });
  }
  // back in progress after an answer: the customer asked for more
  if (inquiry.firstResponseAt) return t("status.reopened");

  const due = replyDueAt(inquiry.sentAt);
  if (due > Date.now()) return t("replyBy", { when: format.full.format(due) });
  return PHONE ? t("replyLate", { phone: PHONE }) : t("replyLateNoPhone");
}

// --- Delivery ----------------------------------------------------------------------

const TROUBLE = new Set(["failed", "bounced", "delayed"]);

const DETAIL_ROW = "grid gap-x-6 py-2.5 text-[15px] sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]";

function Delivery({ inquiry, format }: { inquiry: Inquiry; format: Format }) {
  const t = useTranslations("account.inquiries.delivery");
  const { delivery, copy } = inquiry;
  const teamTrouble = TROUBLE.has(delivery.status);
  const copyTrouble = TROUBLE.has(copy.status ?? "") || copy.skipReason === "limit";
  const [open, setOpen] = useState(copyTrouble);
  const at = (value?: number) => (value ? format.time.format(value) : undefined);

  const summary = [t(`team.${delivery.status}`), copy.status ? t(`copy.${copy.status}`) : null]
    .filter(Boolean)
    .join(" · ");

  const teamSteps: Checkpoint[] = [
    { key: "queued", label: t("steps.queued"), meta: at(inquiry.sentAt), state: "done" },
    {
      key: "sent",
      label: t("steps.sent"),
      meta: at(delivery.lastAttemptAt),
      state:
        delivery.status === "failed" ? "failed" : delivery.status === "queued" ? "current" : "done",
    },
    {
      key: "delivered",
      label: t("steps.delivered"),
      meta: at(delivery.deliveredAt),
      state:
        delivery.status === "delivered"
          ? "done"
          : delivery.status === "bounced"
            ? "failed"
            : delivery.status === "delayed"
              ? "warning"
              : "upcoming",
    },
  ];

  const copySteps: Checkpoint[] = [
    {
      key: "sent",
      label: t("steps.copySent"),
      state: copy.status === "failed" ? "failed" : "done",
    },
    {
      key: "delivered",
      label: t("steps.copyDelivered"),
      meta: at(copy.deliveredAt),
      state:
        copy.status === "delivered"
          ? "done"
          : copy.status === "bounced"
            ? "failed"
            : copy.status === "delayed"
              ? "warning"
              : "upcoming",
    },
  ];

  return (
    <div>
      <div className={DETAIL_ROW}>
        <span className="text-muted-foreground">{t("label")}</span>
        <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className={cn(teamTrouble || copyTrouble ? "font-medium" : "", "text-foreground")}>
            {summary}
          </span>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            data-print-hide
            className="shrink-0 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {open ? t("hide") : t("details")}
          </button>
        </span>
      </div>

      {open ? (
        <div className="mt-4 mb-2 space-y-6">
          <div>
            <p className="mb-4 text-sm font-medium text-muted-foreground">{t("toTeam")}</p>
            <Checkpoints label={t("toTeam")} steps={teamSteps} />
          </div>
          {copy.status ? (
            <div>
              <p className="mb-4 text-sm font-medium text-muted-foreground">
                {t("toYou", { email: inquiry.email })}
              </p>
              {copy.status === "skipped" ? (
                <p className="text-[15px] text-muted-foreground">
                  {t(`skipped.${copy.skipReason ?? "limit"}`)}
                </p>
              ) : (
                <Checkpoints label={t("toYou", { email: inquiry.email })} steps={copySteps}>
                  {TROUBLE.has(copy.status) ? (
                    <CheckpointNote
                      tone={copy.status === "delayed" ? "warning" : "failed"}
                      title={t(`reasons.${copy.failureReason ?? "unknown"}.title`)}
                    >
                      {t(`reasons.${copy.failureReason ?? "unknown"}.copyBody`, {
                        email: inquiry.email,
                      })}
                    </CheckpointNote>
                  ) : null}
                </Checkpoints>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TeamNote({ inquiry, format }: { inquiry: Inquiry; format: Format }) {
  const t = useTranslations("account.inquiries.delivery");
  const trackEvent = useTrackEvent();
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const { delivery } = inquiry;
  const reason = delivery.failureReason ?? "unknown";

  if (delivery.status === "delayed") {
    return (
      <CheckpointNote tone="warning" title={t("reasons.temporary.title")}>
        {t("reasons.temporary.body")}
      </CheckpointNote>
    );
  }

  const sendAgain = async () => {
    setSending(true);
    trackEvent("Account - Inquiry Sent Again");
    const { data, error } = await api.submissions({ id: inquiry._id }).retry.post();
    setSending(false);
    if (error || !data || !("status" in data) || data.status === "failed") {
      toast.error(t("retryFailed"));
    } else {
      toast.success(t("retried"));
    }
    router.refresh();
  };

  return (
    <CheckpointNote
      tone="failed"
      title={t(`reasons.${reason}.title`)}
      detail={t("attempts", {
        count: delivery.attempts,
        when: format.dateTime.format(delivery.lastAttemptAt),
      })}
      action={
        <Button size="sm" shape="pill" disabled={sending} onClick={() => void sendAgain()}>
          {t("sendAgain")}
        </Button>
      }
    >
      {t(`reasons.${reason}.body`)}
      {delivery.attempts >= 2 && PHONE ? ` ${t("callInstead", { phone: PHONE })}` : null}
    </CheckpointNote>
  );
}

// --- Callback ----------------------------------------------------------------------

function Callback({ inquiry, format }: { inquiry: Inquiry; format: Format }) {
  const t = useTranslations("account.inquiries.callback");
  const at = inquiry.callbackConfirmedAt ?? inquiry.desiredAt;
  const cancelled = inquiry.callbackStatus === "cancelled";
  const confirmed = inquiry.callbackStatus === "confirmed";
  const done = confirmed && at !== undefined && at < Date.now();

  const steps: Checkpoint[] = cancelled
    ? [
        { key: "requested", label: t("requested"), meta: fmt(inquiry.desiredAt), state: "done" },
        { key: "cancelled", label: t("cancelled"), state: "skipped" },
      ]
    : [
        { key: "requested", label: t("requested"), meta: fmt(inquiry.desiredAt), state: "done" },
        {
          key: "confirmed",
          label: t("confirmed"),
          meta: confirmed ? fmt(inquiry.callbackConfirmedAt) : undefined,
          state: confirmed ? "done" : "current",
        },
        { key: "done", label: t("done"), state: done ? "done" : "upcoming" },
      ];

  function fmt(value?: number) {
    return value ? format.dateTime.format(value) : undefined;
  }

  const addToCalendar = () => {
    if (!at) return;
    const ics = buildIcs({
      uid: inquiry._id,
      start: at,
      title: t("calendarTitle"),
      description: [inquiry.reference, inquiry.phone].filter(Boolean).join("\n"),
    });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const link = Object.assign(document.createElement("a"), {
      href: url,
      download: `${inquiry.reference}.ics`,
    });
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="mt-10 border-t border-rule pt-6">
      <p className="mb-4 text-sm font-medium text-muted-foreground">{t("title")}</p>
      <Checkpoints label={t("title")} steps={steps}>
        {!cancelled && !done ? (
          <div data-print-hide className="mt-5 flex flex-wrap gap-2">
            {isUpcomingCallback(inquiry) ? (
              <Button size="sm" variant="outline" shape="pill" onClick={addToCalendar}>
                <CalendarPlus />
                {t("addToCalendar")}
              </Button>
            ) : null}
            <Button asChild size="sm" variant="ghost">
              <Link href={{ pathname: "/contact", query: { mode: "callback" } }}>
                {t("anotherTime")}
              </Link>
            </Button>
          </div>
        ) : null}
      </Checkpoints>
      {!confirmed && !cancelled ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("unconfirmedHint")}</p>
      ) : null}
    </section>
  );
}

// --- What was sent, and since ------------------------------------------------------

type Attachment = Inquiry["attachments"][number];

function Attachments({ inquiryId, attachments }: { inquiryId: string; attachments: Attachment[] }) {
  if (!attachments.length) return null;
  return (
    <ul className="mt-4 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <li key={attachment.storageId}>
          <a
            href={`/api/submissions/${inquiryId}/attachments/${attachment.storageId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-rule px-2.5 py-1 text-sm text-foreground hover:bg-accent"
          >
            <Paperclip aria-hidden className="size-3.5 text-muted-foreground" />
            {attachment.name}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * What was sent and everything said since, as one thread: the original
 * inquiry first, then each reply in order. The customer reads a
 * conversation, not a form receipt with comments bolted on underneath.
 */
function Conversation({
  detail,
  body,
  format,
}: {
  detail: Detail;
  body: string | undefined;
  format: Format;
}) {
  const t = useTranslations("account.inquiries.thread");
  const tCallback = useTranslations("account.inquiries.callback");
  const { inquiry } = detail;
  const you = `${inquiry.firstName[0] ?? ""}${inquiry.lastName[0] ?? ""}`.toUpperCase() || "·";
  const opening =
    body ||
    (inquiry.submissionType === "callback" && inquiry.desiredAt
      ? tCallback("requestedFor", { when: format.full.format(inquiry.desiredAt) })
      : "");

  return (
    <section className="mt-12">
      <h2 className="text-sm font-medium text-muted-foreground">{t("title")}</h2>
      <ol className="mt-2 divide-y divide-rule border-y border-rule">
        <Entry
          initials={you}
          who={t("you")}
          at={inquiry.sentAt}
          body={opening}
          format={format}
          inquiryId={inquiry._id}
          attachments={inquiry.attachments}
        />
        {detail.messages.map((message) => (
          <Entry
            key={message._id}
            staff={message.author === "staff"}
            initials={
              message.author === "customer" ? you : (message.staffName?.[0] ?? "A").toUpperCase()
            }
            who={
              message.author === "customer"
                ? t("you")
                : message.staffName
                  ? t("staff", { name: message.staffName })
                  : t("team")
            }
            at={message.createdAt}
            body={message.body}
            format={format}
            inquiryId={inquiry._id}
            attachments={message.attachments}
          />
        ))}
      </ol>
    </section>
  );
}

function Entry({
  staff = false,
  initials,
  who,
  at,
  body,
  format,
  inquiryId,
  attachments,
}: {
  staff?: boolean;
  initials: string;
  who: string;
  at: number;
  body: string;
  format: Format;
  inquiryId: string;
  attachments: Attachment[];
}) {
  return (
    <li className="flex gap-3.5 py-6">
      <span
        aria-hidden
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
          staff ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
        )}
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{who}</span>
          {" · "}
          <time dateTime={new Date(at).toISOString()} title={format.full.format(at)}>
            {format.when(at)}
          </time>
        </p>
        {body ? (
          <p className="mt-2 max-w-[65ch] text-base leading-[1.7] whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
            {body}
          </p>
        ) : null}
        <Attachments inquiryId={inquiryId} attachments={attachments} />
      </div>
    </li>
  );
}
const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/*,application/pdf,.doc,.docx";

function Composer({
  inquiry,
  composerRef,
}: {
  inquiry: Inquiry;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const t = useTranslations("account.inquiries.thread");
  const router = useRouter();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  if (inquiry.state === "withdrawn") return null;

  const upload = async (file: File) => {
    const { data } = await api.submissions["upload-url"].post();
    if (!data || !("url" in data) || !data.url) throw new Error("no upload url");
    const response = await fetch(data.url, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    const { storageId } = (await response.json()) as { storageId: string };
    return {
      storageId,
      name: file.name,
      size: file.size,
      contentType: file.type,
      kind: file.type.startsWith("image/") ? ("image" as const) : ("file" as const),
    };
  };

  const send = async () => {
    if (!body.trim() && !files.length) return;
    setSending(true);
    try {
      const attachments = await Promise.all(files.map(upload));
      const { error } = await api.submissions({ id: inquiry._id }).messages.post({
        body,
        attachments: attachments.length ? attachments : undefined,
      });
      if (error) throw error;
      setBody("");
      setFiles([]);
      toast.success(t("sent"));
      router.refresh();
    } catch {
      toast.error(t("sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const pick = (list: FileList | null) => {
    const picked = [...(list ?? [])];
    if (picked.some((file) => file.size > MAX_BYTES)) toast.error(t("tooLarge"));
    setFiles((current) =>
      [...current, ...picked.filter((file) => file.size <= MAX_BYTES)].slice(0, MAX_FILES),
    );
  };

  return (
    <section data-print-hide className="mt-10">
      <label htmlFor="inquiry-reply" className="text-sm font-medium text-muted-foreground">
        {t("add")}
      </label>
      <textarea
        id="inquiry-reply"
        ref={composerRef}
        rows={3}
        value={body}
        maxLength={5000}
        onChange={(event) => setBody(event.target.value)}
        placeholder={t("placeholder")}
        className="mt-2 min-h-24 w-full resize-y rounded-lg border border-input bg-card px-3 py-2.5 text-base placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:text-[15px]"
      />
      {files.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-rule px-2.5 py-1 text-sm"
            >
              <Paperclip aria-hidden className="size-3.5 text-muted-foreground" />
              {file.name}
              <button
                type="button"
                aria-label={t("removeFile", { name: file.name })}
                onClick={() => setFiles(files.filter((_, i) => i !== index))}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground",
            files.length >= MAX_FILES && "pointer-events-none opacity-50",
          )}
        >
          <Paperclip aria-hidden className="size-3.5" />
          {t("attach")}
          <input
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            onChange={(event) => {
              pick(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        <div className="flex items-center gap-3">
          {inquiry.state === "answered" || inquiry.state === "closed" ? (
            <span className="text-sm text-muted-foreground">{t("reopensHint")}</span>
          ) : null}
          <Button
            size="sm"
            shape="pill"
            disabled={sending || (!body.trim() && !files.length)}
            onClick={() => void send()}
          >
            {t("send")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function Actions({ inquiry, onNeedHelp }: { inquiry: Inquiry; onNeedHelp: () => void }) {
  const t = useTranslations("account.inquiries.actions");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const act = async (action: "withdraw" | "resolve") => {
    setBusy(true);
    const { error } = await api.submissions({ id: inquiry._id }).state.post({ action });
    setBusy(false);
    setConfirming(false);
    if (error) toast.error(t("failed"));
    else toast.success(t(`${action}Done`));
    router.refresh();
  };

  const link =
    "text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";

  if (isActive(inquiry.state)) {
    return (
      <div data-print-hide className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        {confirming ? (
          <>
            <span className="text-sm text-foreground">{t("withdrawConfirm")}</span>
            <button
              type="button"
              disabled={busy}
              className={link}
              onClick={() => void act("withdraw")}
            >
              {t("withdrawYes")}
            </button>
            <button type="button" className={link} onClick={() => setConfirming(false)}>
              {t("cancel")}
            </button>
          </>
        ) : (
          <button type="button" className={link} onClick={() => setConfirming(true)}>
            {t("withdraw")}
          </button>
        )}
      </div>
    );
  }

  if (inquiry.state === "answered" || inquiry.state === "closed") {
    return (
      <div data-print-hide className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        {inquiry.state === "answered" ? (
          <button
            type="button"
            disabled={busy}
            className={link}
            onClick={() => void act("resolve")}
          >
            <Check aria-hidden className="mr-1 inline size-3.5" />
            {t("resolve")}
          </button>
        ) : null}
        <button type="button" className={link} onClick={onNeedHelp}>
          {t("stillNeedHelp")}
        </button>
      </div>
    );
  }

  return null;
}

function Shared({ inquiry, format }: { inquiry: Inquiry; format: Format }) {
  const t = useTranslations("account.inquiries.shared");
  const tTopics = useTranslations("contact.otherForm.topics");
  const rows = [
    {
      label: t("email"),
      value: inquiry.email !== inquiry.accountEmail ? inquiry.email : undefined,
    },
    { label: t("phone"), value: inquiry.phone },
    { label: t("company"), value: inquiry.company },
    { label: t("topic"), value: inquiry.topicKey ? tTopics(inquiry.topicKey) : inquiry.topic },
    {
      label: t("callbackTime"),
      value: inquiry.desiredAt ? format.full.format(inquiry.desiredAt) : undefined,
    },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));

  if (!rows.length) return null;
  return (
    <dl className="mt-3">
      {rows.map((row) => (
        <div key={row.label} className={DETAIL_ROW}>
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="text-foreground [overflow-wrap:anywhere]">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReferenceChip({ reference }: { reference: string }) {
  const t = useTranslations("account.inquiries");
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      title={t("copyReference")}
      onClick={() => {
        void navigator.clipboard.writeText(reference);
        setCopied(true);
        toast(t("copied", { reference }));
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded-md border border-rule px-1.5 py-0.5 font-mono text-[13px] text-foreground transition-colors hover:bg-accent"
    >
      {reference}
      {copied ? <Check aria-hidden className="size-3" /> : <Copy aria-hidden className="size-3" />}
    </button>
  );
}
