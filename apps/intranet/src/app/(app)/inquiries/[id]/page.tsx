"use client";

import { useEffect, useMemo, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { inquiryTitleParts, type InquiryState } from "@advantis/convex/marketing/inquiry";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Copy, Inbox, Lock, Paperclip, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { STATES, StateBadge, TYPE_ICON, senderLine } from "@/components/inquiries/shared";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { Link } from "@/components/Link";
import { useCurrentUser, useHasCapability } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Timeline } from "@/components/ui/timeline";

const UNASSIGNED = "none";
// the same limits Convex checks on a reply's attachments
const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;

/** `YYYY-MM-DDTHH:mm` in the browser's zone, for a datetime-local input. */
const toLocalInput = (at: number) => {
  const d = new Date(at - new Date(at).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

/**
 * One inquiry for the team: what the customer sent, the reply thread, and
 * the controls to move it along (state, assignee, callback slot). Opening it
 * marks it seen, which the customer sees on their own inquiry page.
 */
export default function InquiryPage() {
  const t = useTranslations("Inquiries");
  const locale = useLocale();
  const router = useRouter();
  // an id, or a reference someone pasted: /inquiries/AG-0042, /inquiries/841kgr
  const ref = decodeURIComponent(useParams<{ id: string }>().id);
  const canManage = useHasCapability("manage_inquiries");
  const me = useCurrentUser();
  const data = useQuery(api.marketing.inbox.get, canManage ? { id: ref } : "skip");
  const staff = useQuery(api.marketing.inbox.staff, canManage ? {} : "skip");
  const markSeen = useMutation(api.marketing.inbox.markSeen);
  const setState = useMutation(api.marketing.inbox.setState);
  const assign = useMutation(api.marketing.inbox.assign);
  const reply = useMutation(api.marketing.inbox.reply);
  const confirmCallback = useMutation(api.marketing.inbox.confirmCallback);
  const cancelCallback = useMutation(api.marketing.inbox.cancelCallback);
  const generateUploadUrl = useMutation(api.marketing.inbox.generateUploadUrl);

  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [slot, setSlot] = useState("");

  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  const inquiry = data?.inquiry;
  const resolvedId = inquiry?._id;
  const unseen = inquiry ? !inquiry.seenAt : false;
  useEffect(() => {
    if (unseen && resolvedId) void markSeen({ id: resolvedId });
  }, [unseen, resolvedId, markSeen]);

  // opened by reference: settle on the id URL, so the address bar is the one link to share
  useEffect(() => {
    if (resolvedId && resolvedId !== ref) router.replace(`/inquiries/${resolvedId}`);
  }, [resolvedId, ref, router]);

  useEffect(() => {
    if (!inquiry) return;
    const at = inquiry.callbackConfirmedAt ?? inquiry.desiredAt;
    if (at && !slot) setSlot(toLocalInput(at));
  }, [inquiry, slot]);

  if (!canManage) return <EmptyState icon={<Lock />} title={t("noAccess")} />;
  if (data === undefined) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (data === null || !inquiry) {
    return <EmptyState className="mt-10" icon={<Inbox />} title={t("notFound")} />;
  }

  const inquiryId = inquiry._id;
  const Icon = TYPE_ICON[inquiry.submissionType];
  const parts = inquiryTitleParts(inquiry);
  const title =
    parts.kind === "text" || parts.kind === "subject"
      ? parts.text
      : parts.kind === "callback" && parts.at
        ? t("callbackAt", { when: format.format(parts.at) })
        : t(`types.${inquiry.submissionType}`);
  const failed = inquiry.status === "failed" || inquiry.status === "bounced";

  const run = async (action: () => Promise<unknown>, done?: string) => {
    try {
      await action();
      if (done) toast.success(done);
    } catch {
      toast.error(t("actionFailed"));
    }
  };

  const upload = async (file: File) => {
    const url = await generateUploadUrl({});
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
    return {
      storageId,
      name: file.name,
      size: file.size,
      contentType: file.type,
      kind: file.type.startsWith("image/") ? ("image" as const) : ("file" as const),
    };
  };

  const sendReply = async () => {
    if (!draft.trim() && !files.length) return;
    setSending(true);
    await run(async () => {
      const attachments = await Promise.all(files.map(upload));
      await reply({
        id: inquiryId,
        body: draft,
        attachments: attachments.length ? attachments : undefined,
      });
      setDraft("");
      setFiles([]);
    }, t("replySent"));
    setSending(false);
  };

  const pickFiles = (list: FileList | null) => {
    const picked = [...(list ?? [])];
    if (picked.some((file) => file.size > MAX_BYTES)) toast.error(t("tooLarge"));
    setFiles((current) =>
      [...current, ...picked.filter((file) => file.size <= MAX_BYTES)].slice(0, MAX_FILES),
    );
  };

  const details: [string, string | undefined][] = [
    [t("fields.email"), inquiry.email],
    [t("fields.phone"), inquiry.phone],
    [t("fields.company"), inquiry.company],
    [t("fields.topic"), inquiry.topic],
    [
      t("fields.desiredAt"),
      inquiry.desiredAt
        ? `${format.format(inquiry.desiredAt)}${inquiry.timeZone ? ` (${inquiry.timeZone})` : ""}`
        : undefined,
    ],
    [t("fields.language"), inquiry.locale?.toUpperCase()],
    [t("fields.account"), inquiry.accountEmail || undefined],
  ];

  const eventLabel = (event: (typeof data.events)[number]) =>
    event.type === "state" && event.state
      ? t("events.state", { state: t(`states.${event.state}`) })
      : t(`events.${event.type}`);

  const timeline = [...data.events].reverse().map((event) => ({
    key: event._id,
    title: eventLabel(event),
    meta: [format.format(event.at), event.actorName ?? t(`actors.${event.actor}`)]
      .filter(Boolean)
      .join(" · "),
  }));

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeaderBar title={t("title")} description={t("description")} icon={<Inbox />} />

      <Link
        href="/inquiries"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Icon aria-hidden className="size-3.5" />
            <span>{t(`types.${inquiry.submissionType}`)}</span>
            <span aria-hidden>·</span>
            <button
              type="button"
              title={t("copyReference")}
              onClick={() =>
                void navigator.clipboard
                  .writeText(inquiry.reference)
                  .then(() => toast.success(t("referenceCopied", { reference: inquiry.reference })))
              }
              className="inline-flex items-center gap-1 rounded tabular-nums hover:text-foreground"
            >
              {inquiry.reference}
              <Copy aria-hidden className="size-3" />
            </button>
            <span aria-hidden>·</span>
            <span>{format.format(inquiry.sentAt)}</span>
          </p>
          <h1 className="mt-2 text-xl font-semibold leading-snug break-words">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{senderLine(inquiry)}</p>

          {failed || inquiry.overdue ? (
            <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {failed ? t("notDeliveredHint") : t("overdueHint")}
            </p>
          ) : null}

          {inquiry.message.trim() ? (
            <p className="mt-6 max-w-[70ch] whitespace-pre-wrap break-words text-[15px] leading-7">
              {inquiry.message}
            </p>
          ) : null}
          {inquiry.notes?.trim() ? (
            <p className="mt-4 max-w-[70ch] whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
              {inquiry.notes}
            </p>
          ) : null}

          <Attachments items={data.attachments} />

          <dl className="mt-8 divide-y divide-border border-y border-border text-sm">
            {details
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-4 py-2.5">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
          </dl>

          <section className="mt-10" aria-labelledby="thread">
            <h2 id="thread" className="text-sm font-semibold">
              {t("thread")}
            </h2>
            {data.messages.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("noReplies")}</p>
            ) : (
              <ol className="mt-4 space-y-4">
                {data.messages.map((message) => (
                  <li
                    key={message._id}
                    className={`rounded-lg border px-4 py-3 ${
                      message.author === "staff"
                        ? "border-primary/30 bg-primary/5"
                        : "border-border"
                    }`}
                  >
                    <p className="text-xs text-muted-foreground">
                      {message.author === "staff"
                        ? (message.staffName ?? t("actors.staff"))
                        : t("actors.customer")}
                      {" · "}
                      {format.format(message.createdAt)}
                      {message.via === "email" ? ` · ${t("viaEmail")}` : ""}
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6">
                      {message.body}
                    </p>
                    <Attachments items={message.attachments} />
                  </li>
                ))}
              </ol>
            )}

            {inquiry.anonymizedAt ? null : (
              <div className="mt-6">
                <label htmlFor="reply" className="sr-only">
                  {t("replyLabel")}
                </label>
                <Textarea
                  id="reply"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t("replyPlaceholder", {
                    name: inquiry.firstName || inquiry.email,
                  })}
                  rows={5}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      void sendReply();
                    }
                  }}
                />
                {files.length ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs"
                      >
                        <Paperclip className="size-3.5 text-muted-foreground" aria-hidden />
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
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <label
                      className={`inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground ${
                        files.length >= MAX_FILES ? "pointer-events-none opacity-50" : ""
                      }`}
                    >
                      <Paperclip className="size-3.5" aria-hidden />
                      {t("attach")}
                      <input
                        type="file"
                        multiple
                        accept="image/*,application/pdf,.doc,.docx"
                        className="sr-only"
                        onChange={(event) => {
                          pickFiles(event.target.files);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    <p className="text-xs text-muted-foreground">{t("replyHint")}</p>
                  </div>
                  <Button
                    onClick={() => void sendReply()}
                    disabled={sending || (!draft.trim() && !files.length)}
                  >
                    {t("sendReply")}
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
          <section>
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("state")}
            </h2>
            <div className="mt-2">
              <StateBadge state={inquiry.state} />
            </div>
            <Select
              value={inquiry.state}
              onValueChange={(value) =>
                void run(() => setState({ id: inquiryId, state: value as InquiryState }))
              }
            >
              <SelectTrigger className="mt-3 w-full" aria-label={t("changeState")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATES.map((state) => (
                  <SelectItem key={state} value={state}>
                    {t(`states.${state}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">{t("stateHint")}</p>
          </section>

          <section>
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("assignee")}
            </h2>
            <Select
              value={inquiry.assignedToUserId ?? UNASSIGNED}
              onValueChange={(value) =>
                void run(() =>
                  assign({
                    id: inquiryId,
                    userId: value === UNASSIGNED ? undefined : (value as Id<"users">),
                  }),
                )
              }
            >
              <SelectTrigger className="mt-2 w-full" aria-label={t("assignee")}>
                <SelectValue placeholder={t("unassigned")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>{t("unassigned")}</SelectItem>
                {inquiry.assignedToUserId &&
                !staff?.some((person) => person.id === inquiry.assignedToUserId) ? (
                  <SelectItem value={inquiry.assignedToUserId}>
                    {data.assigneeName ?? inquiry.assignedToUserId}
                  </SelectItem>
                ) : null}
                {staff?.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {inquiry.assignedToUserId !== me._id ? (
              <Button
                variant="link"
                size="sm"
                className="mt-1 h-auto px-0"
                onClick={() =>
                  void run(() => assign({ id: inquiryId, userId: me._id as Id<"users"> }))
                }
              >
                {t("assignToMe")}
              </Button>
            ) : null}
          </section>

          {inquiry.submissionType === "callback" ? (
            <section>
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("callback")}
              </h2>
              <p className="mt-2 text-sm">
                {t(`callbackStatus.${inquiry.callbackStatus ?? "requested"}`)}
                {inquiry.callbackConfirmedAt
                  ? ` · ${format.format(inquiry.callbackConfirmedAt)}`
                  : ""}
              </p>
              {inquiry.callbackStatus === "cancelled" ? null : (
                <>
                  <label htmlFor="slot" className="mt-3 block text-xs text-muted-foreground">
                    {t("callbackSlot")}
                  </label>
                  <Input
                    id="slot"
                    type="datetime-local"
                    value={slot}
                    onChange={(event) => setSlot(event.target.value)}
                    className="mt-1"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={!slot}
                      onClick={() =>
                        void run(
                          () =>
                            confirmCallback({
                              id: inquiryId,
                              at: new Date(slot).getTime(),
                            }),
                          t("callbackConfirmedToast"),
                        )
                      }
                    >
                      {inquiry.callbackStatus === "confirmed"
                        ? t("moveCallback")
                        : t("confirmCallback")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void run(
                          () => cancelCallback({ id: inquiryId }),
                          t("callbackCancelledToast"),
                        )
                      }
                    >
                      {t("cancelCallback")}
                    </Button>
                  </div>
                </>
              )}
            </section>
          ) : null}

          <section>
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("history")}
            </h2>
            <Timeline
              className="mt-3"
              entries={timeline}
              accent={`var(--${inquiry.state === "open" ? "warn" : "primary"})`}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}

function Attachments({
  items,
}: {
  items: { storageId: string; name?: string; url: string | null }[] | undefined;
}) {
  if (!items?.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {items.map((item) =>
        item.url ? (
          <li key={item.storageId}>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
            >
              <Paperclip className="size-3.5" aria-hidden />
              {item.name ?? item.storageId}
            </a>
          </li>
        ) : null,
      )}
    </ul>
  );
}
