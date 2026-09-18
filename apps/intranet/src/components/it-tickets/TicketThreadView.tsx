"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { Lock, LockOpen, MessageSquare, Paperclip, SmilePlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AttachmentList } from "@/components/attachments/AttachmentList";
import { useAttachmentUpload } from "@/components/attachments/useAttachmentUpload";
import {
  CHAT_COLUMN,
  ChatDayDivider,
  ChatEvent,
  chatBubbleClass,
} from "@/components/chat/chat-surface";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { useFileViewer } from "@/components/file-viewer/FileViewerProvider";
import { useCurrentUser, useHasCapability } from "@/components/providers/current-user";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { ReactionChips, ReactionPicker } from "@/components/ui/reactions";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type Thread = NonNullable<FunctionReturnType<typeof api.itTickets.threads.getForTicket>>;

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
  // The size-limit copy already exists in the Chat namespace; the composer
  // is shared, so the message should be too.
  const tChat = useTranslations("Chat");
  const locale = useLocale();
  const me = useCurrentUser();
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const canPost = useHasCapability("manage_it_ticket_threads");

  const messages = useQuery(api.itTickets.threads.listMessages, { threadId: thread._id }) ?? [];
  const sendMessage = useMutation(api.itTickets.threads.sendMessage);
  const toggleReaction = useMutation(api.itTickets.threads.toggleReaction);
  const attachmentUpload = useAttachmentUpload();
  const { openFileViewer } = useFileViewer();
  const lockThread = useMutation(api.itTickets.threads.lock);
  const unlockThread = useMutation(api.itTickets.threads.unlock);

  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    if (!text && attachmentUpload.entries.length === 0) return;
    setSending(true);
    try {
      const uploaded = await attachmentUpload.uploadAll();
      try {
        await sendMessage({
          threadId: thread._id,
          body: text,
          attachments: uploaded.length > 0 ? (uploaded as never) : undefined,
        });
      } catch (e) {
        // Don't leave the files orphaned in storage if the send itself fails.
        await attachmentUpload.rollback(uploaded);
        throw e;
      }
      setBody("");
      attachmentUpload.reset();
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

      {/* A column with the list pushed down (`mt-auto`), so a short thread sits
          on the composer instead of hanging from the top of an empty panel.
          Once it overflows, `mt-auto` stops doing anything and it scrolls. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <MessageSquare className="size-5" />
            </span>
            <p className="text-sm font-medium">{t("thread.noMessages")}</p>
            <p className="text-xs text-muted-foreground">{t("thread.noMessagesHint")}</p>
          </div>
        ) : (
          <div className={cn("mt-auto space-y-3", CHAT_COLUMN)}>
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const showDay =
                i === 0 ||
                new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();

              if (m.kind === "system") {
                return (
                  <Fragment key={m._id}>
                    {showDay && <ChatDayDivider label={dayLabel(m.createdAt)} />}
                    <ChatEvent>
                      {t(m.event === "locked" ? "thread.lockedBy" : "thread.unlockedBy", {
                        name: m.actorName,
                      })}
                    </ChatEvent>
                  </Fragment>
                );
              }

              const mine = m.senderUserId === me._id;
              const isCreator = m.senderUserId === ticketCreatorUserId;
              return (
                <Fragment key={m._id}>
                  {showDay && <ChatDayDivider label={dayLabel(m.createdAt)} />}
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
                        className={cn("group/msg flex items-end gap-1", mine && "flex-row-reverse")}
                      >
                        <div className={chatBubbleClass(mine)}>
                          {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                          {m.attachments.length > 0 && (
                            <div className={cn("flex flex-col gap-1", m.body && "mt-1.5")}>
                              {m.attachments.map((a) => (
                                <button
                                  key={a.storageId}
                                  type="button"
                                  onClick={() =>
                                    openFileViewer({
                                      storageId: a.storageId,
                                      name: a.name,
                                      contentType: a.contentType ?? undefined,
                                      size: a.size ?? undefined,
                                      url: a.url ?? undefined,
                                    })
                                  }
                                  className="flex items-center gap-2 rounded-lg bg-background/60 px-2 py-1.5 text-left transition-colors hover:bg-background"
                                >
                                  <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                                  <span className="min-w-0 truncate text-xs font-medium">
                                    {a.name}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <ReactionPicker
                          side="top"
                          align={mine ? "end" : "start"}
                          onPick={(emoji) =>
                            void toggleReaction({ messageId: m._id, emoji }).catch(handleError)
                          }
                          trigger={
                            <button
                              type="button"
                              aria-label={t("thread.react")}
                              className="mb-1 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden md:group-hover/msg:grid"
                            >
                              <SmilePlus className="size-3.5" />
                            </button>
                          }
                        />
                      </div>
                      <ReactionChips
                        reactions={m.reactions}
                        onToggle={(emoji) =>
                          void toggleReaction({ messageId: m._id, emoji }).catch(handleError)
                        }
                      />
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
        // Where the composer would be, shaped like it — a read-only
        // conversation reads as "you can't type here", not as a footnote.
        <div className="shrink-0 border-t border-border/70 px-4 py-3 text-center refreshed:border-t-0 refreshed:pb-4 refreshed:pt-2">
          <div
            className={cn(
              "refreshed:flex refreshed:items-center refreshed:gap-3 refreshed:rounded-2xl refreshed:border refreshed:border-border/70 refreshed:bg-card refreshed:px-4 refreshed:py-3 refreshed:text-left",
              CHAT_COLUMN,
            )}
          >
            <span className="hidden size-8 shrink-0 place-items-center rounded-lg bg-muted/70 text-muted-foreground refreshed:grid">
              <Lock className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("thread.locked")}</p>
              {canPost && <p className="text-xs text-muted-foreground">{t("thread.lockedHint")}</p>}
            </div>
          </div>
        </div>
      ) : canPost ? (
        <div className="shrink-0">
          <MessageComposer
            value={body}
            onChange={setBody}
            onSend={() => void send()}
            sending={sending}
            disabled={attachmentUpload.uploading}
            placeholder={t("thread.messagePlaceholder")}
            textareaRef={textareaRef}
            onPickFiles={(files) => {
              // `add` refuses the whole batch over the size cap and returns
              // false — without this the picker just closes with nothing
              // attached and no explanation.
              if (!attachmentUpload.add(files)) toast.error(tChat("attachTooLarge"));
            }}
            above={
              attachmentUpload.entries.length > 0 ? (
                <div className="mb-2">
                  <AttachmentList
                    entries={attachmentUpload.entries}
                    uploading={attachmentUpload.uploading}
                    onRemove={attachmentUpload.remove}
                    removeLabel={tc("delete")}
                  />
                </div>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="shrink-0 border-t border-border/70 px-4 py-3 text-center text-xs text-muted-foreground">
          {t("thread.readOnlyNote")}
        </div>
      )}
    </div>
  );
}
