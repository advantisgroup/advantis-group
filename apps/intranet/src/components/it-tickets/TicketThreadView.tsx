"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { Loader2, Lock, LockOpen, MessageSquare, SendHorizonal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { useCurrentUser, useHasCapability } from "@/components/providers/current-user";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const COMPOSER_MAX_HEIGHT = 160;

type Thread = NonNullable<FunctionReturnType<typeof api.itTicketThreads.getForTicket>>;

function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-1">
      <span className="rounded-full bg-muted px-3 py-0.5 text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

/**
 * The chat window for a ticket's thread — mirrors ConversationView's basic
 * shape (day dividers, left/right bubbles) without the heavier chat features
 * (reactions, replies, mentions, attachments) this doesn't need. Read-only
 * for anyone without `manage_it_ticket_threads`; the composer disappears
 * entirely once the thread is locked, replaced by a plain notice — matching
 * ConversationView's pattern for its own "can't post here" states.
 */
export function TicketThreadView({
  thread,
  ticketCreatorUserId,
}: {
  thread: Thread;
  ticketCreatorUserId: Id<"users">;
}) {
  const t = useTranslations("ItTickets");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const me = useCurrentUser();
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const canPost = useHasCapability("manage_it_ticket_threads");

  const messages = useQuery(api.itTicketThreads.listMessages, { threadId: thread._id }) ?? [];
  const sendMessage = useMutation(api.itTicketThreads.sendMessage);
  const lockThread = useMutation(api.itTicketThreads.lock);
  const unlockThread = useMutation(api.itTicketThreads.unlock);

  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [body]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function dayLabel(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return t("thread.today");
    if (d.toDateString() === yesterday.toDateString()) return t("thread.yesterday");
    return d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  }

  async function send() {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      await sendMessage({ threadId: thread._id, body: text });
      setBody("");
      textareaRef.current?.focus();
    } catch (e) {
      handleError(e);
    } finally {
      setSending(false);
    }
  }

  async function toggleLock() {
    const locking = !thread.lockedAt;
    const ok = await confirm({
      title: locking ? t("thread.lockConfirmTitle") : t("thread.unlockConfirmTitle"),
      description: locking
        ? t("thread.lockConfirmDescription")
        : t("thread.unlockConfirmDescription"),
      confirmLabel: locking ? t("thread.lock") : t("thread.unlock"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    try {
      if (locking) await lockThread({ threadId: thread._id });
      else await unlockThread({ threadId: thread._id });
    } catch (e) {
      handleError(e);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {canPost && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border/70 px-4 py-2.5">
          <Button variant="outline" size="sm" onClick={() => void toggleLock()}>
            {thread.lockedAt ? (
              <LockOpen className="mr-1.5 size-3.5" />
            ) : (
              <Lock className="mr-1.5 size-3.5" />
            )}
            {thread.lockedAt ? t("thread.unlock") : t("thread.lock")}
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <MessageSquare className="size-5" />
            </span>
            <p className="text-sm font-medium">{t("thread.noMessages")}</p>
            <p className="text-xs text-muted-foreground">{t("thread.noMessagesHint")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const showDay =
                i === 0 ||
                new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();

              if (m.kind === "system") {
                return (
                  <Fragment key={m._id}>
                    {showDay && <DayDivider label={dayLabel(m.createdAt)} />}
                    <div className="flex items-center justify-center py-1">
                      <span className="rounded-full bg-muted px-3 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {t(m.event === "locked" ? "thread.lockedBy" : "thread.unlockedBy", {
                          name: m.actorName,
                        })}
                      </span>
                    </div>
                  </Fragment>
                );
              }

              const mine = m.senderUserId === me._id;
              const isCreator = m.senderUserId === ticketCreatorUserId;
              return (
                <Fragment key={m._id}>
                  {showDay && <DayDivider label={dayLabel(m.createdAt)} />}
                  <div className={cn("flex gap-2", mine && "flex-row-reverse")}>
                    <Avatar className="mt-auto size-7 shrink-0">
                      <AvatarFallback className="text-[10px]">
                        {initials(m.senderName)}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={cn(
                        "flex min-w-0 max-w-[78%] flex-col gap-1",
                        mine ? "items-end" : "items-start",
                      )}
                    >
                      <div className={cn("flex items-center gap-1.5", mine && "flex-row-reverse")}>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {m.senderName}
                        </span>
                        {isCreator && (
                          <Badge variant="muted" className="px-1.5 py-0 text-[10px] font-normal">
                            {t("thread.ticketCreatorBadge")}
                          </Badge>
                        )}
                      </div>
                      <div
                        className={cn(
                          "min-w-0 rounded-2xl px-3 py-2 text-sm",
                          mine ? "rounded-br-md bg-blue-500/15" : "rounded-bl-md bg-muted",
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      </div>
                    </div>
                  </div>
                </Fragment>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {thread.lockedAt ? (
        <div className="shrink-0 border-t border-border/70 px-4 py-3 text-center">
          <p className="text-sm font-medium">{t("thread.locked")}</p>
          {canPost && <p className="text-xs text-muted-foreground">{t("thread.lockedHint")}</p>}
        </div>
      ) : canPost ? (
        <div className="flex shrink-0 items-end gap-2 border-t border-border/70 p-3">
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("thread.messagePlaceholder")}
            rows={1}
            className="min-h-9 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
            style={{ maxHeight: COMPOSER_MAX_HEIGHT }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button
            size="icon"
            className="size-9 shrink-0"
            onClick={() => void send()}
            disabled={sending || !body.trim()}
            aria-label={t("thread.send")}
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <SendHorizonal className="size-4" />
            )}
          </Button>
        </div>
      ) : (
        <div className="shrink-0 border-t border-border/70 px-4 py-3 text-center text-xs text-muted-foreground">
          {t("thread.readOnlyNote")}
        </div>
      )}
    </div>
  );
}
