"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import {
  type LinkPreview,
  type MessageAttachment,
  type UnfurlResult,
} from "@advantis/types";
import { useAuth } from "@clerk/nextjs";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Loader2,
  Paperclip,
  SendHorizonal,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { ReactionChips, ReactionPicker } from "@/components/ui/reactions";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatTime, initials, relativeTime } from "@/lib/format";
import { isImage, uploadToConvex } from "@/lib/upload";
import { cn } from "@/lib/utils";

const URL_RE = /https?:\/\/[^\s]+/i;
const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ??
  "http://localhost:3002";

export function ConversationView({
  conversationId,
  onBack,
}: {
  conversationId: Id<"conversations">;
  onBack: () => void;
}) {
  const t = useTranslations("Chat");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const me = useCurrentUser();
  const confirm = useConfirm();
  const { getToken } = useAuth();

  const conversation = useQuery(api.chat.getConversation, { conversationId });
  const { results, status, loadMore } = usePaginatedQuery(
    api.chat.getMessages,
    { conversationId },
    { initialNumItems: 30 }
  );
  const typingNames = useQuery(api.chat.whoIsTyping, { conversationId }) ?? [];
  const sendMessage = useMutation(api.chat.sendMessage);
  const deleteMessage = useMutation(api.chat.deleteMessage);
  const toggleReaction = useMutation(api.chat.toggleReaction);
  const markRead = useMutation(api.chat.markRead);
  const setTyping = useMutation(api.chat.setTyping);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const handleError = useErrorHandler();

  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastTyping = useRef(0);

  const messages = [...results].reverse();

  const other =
    conversation?.type === "dm"
      ? conversation.members.find(m => m._id !== me._id)
      : undefined;
  const online =
    !!other?.lastActiveAt && Date.now() - other.lastActiveAt < 90_000;

  function dayLabel(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return t("today");
    if (d.toDateString() === yesterday.toDateString()) return t("yesterday");
    return d.toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }

  // Mark read whenever the latest message changes.
  useEffect(() => {
    void markRead({ conversationId });
  }, [conversationId, markRead, results.length]);

  // Auto-scroll to newest.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [results.length]);

  function onType(value: string) {
    setBody(value);
    const now = Date.now();
    if (now - lastTyping.current > 3000) {
      lastTyping.current = now;
      void setTyping({ conversationId });
    }
  }

  async function unfurlFirstLink(text: string): Promise<LinkPreview[]> {
    const match = URL_RE.exec(text);
    if (!match) return [];
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_URL}/unfurl?url=${encodeURIComponent(match[0])}`,
        { headers: token ? { authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) return [];
      const data = (await res.json()) as UnfurlResult;
      if (!data.title && !data.image) return [];
      return [data];
    } catch {
      return [];
    }
  }

  async function onDeleteMessage(messageId: Id<"messages">) {
    const ok = await confirm({
      title: t("deleteMessage"),
      description: t("deleteMessageHint"),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (ok) {
      try {
        await deleteMessage({ messageId });
      } catch (e) {
        handleError(e);
      }
    }
  }

  async function send() {
    const text = body.trim();
    if (!text && files.length === 0) return;
    setSending(true);
    try {
      const attachments: MessageAttachment[] = [];
      for (const file of files) {
        const storageId = await uploadToConvex(
          () => generateUploadUrl({}),
          file
        );
        attachments.push({
          storageId,
          kind: isImage(file) ? "image" : "file",
          name: file.name,
          size: file.size,
          contentType: file.type,
        });
      }
      const linkPreviews = await unfurlFirstLink(text);
      await sendMessage({
        conversationId,
        body: text,
        attachments: attachments as never,
        linkPreviews,
      });
      setBody("");
      setFiles([]);
    } catch (e) {
      handleError(e);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-1 md:hidden"
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="relative shrink-0">
          <Avatar className="size-9">
            {conversation?.avatar && (
              <AvatarImage src={conversation.avatar} alt={conversation.title} />
            )}
            <AvatarFallback className="text-xs">
              {initials(conversation?.title ?? "")}
            </AvatarFallback>
          </Avatar>
          {conversation?.type === "dm" && online && (
            <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-card bg-success" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold leading-tight">
            {conversation?.title}
          </p>
          {conversation?.type === "group" ? (
            <p className="text-xs text-muted-foreground">
              {conversation.members.length} {t("members")}
            </p>
          ) : online ? (
            <p className="flex items-center gap-1 text-xs text-success">
              {t("online")}
            </p>
          ) : other?.lastActiveAt ? (
            <p className="truncate text-xs text-muted-foreground">
              {t("lastSeen", { time: relativeTime(other.lastActiveAt) })}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t("offline")}</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {status === "CanLoadMore" && (
          <div className="mb-2 flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => loadMore(30)}>
              {t("loadMore")}
            </Button>
          </div>
        )}
        <div className="space-y-3">
          {messages.map((m, i) => {
            const mine = m.senderId === me._id;
            const seen = mine && m.seenBy.length > 0;
            const showDay =
              i === 0 ||
              new Date(messages[i - 1].createdAt).toDateString() !==
                new Date(m.createdAt).toDateString();
            return (
              <Fragment key={m._id}>
                {showDay && (
                  <div className="flex items-center justify-center py-1">
                    <span className="rounded-full bg-muted px-3 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {dayLabel(m.createdAt)}
                    </span>
                  </div>
                )}
                <div
                  className={cn("group flex gap-2", mine && "flex-row-reverse")}
                >
                  {!mine && (
                    <Avatar className="mt-auto h-7 w-7 shrink-0">
                      <AvatarFallback className="text-[10px]">
                        {initials(m.senderName)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={cn(
                      "flex min-w-0 max-w-[78%] flex-col gap-1",
                      mine ? "items-end" : "items-start"
                    )}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-1",
                        mine && "flex-row-reverse"
                      )}
                    >
                      <div
                        className={cn(
                          "min-w-0 rounded-2xl px-3 py-2 text-sm",
                          mine
                            ? "rounded-br-md bg-primary text-primary-foreground"
                            : "rounded-bl-md bg-muted"
                        )}
                      >
                        {!mine && conversation?.type === "group" && (
                          <p className="mb-0.5 text-xs font-semibold opacity-80">
                            {m.senderName}
                          </p>
                        )}
                        {m.deleted ? (
                          <p className="italic opacity-70">{t("deleted")}</p>
                        ) : (
                          <>
                            {m.body && (
                              <p className="whitespace-pre-wrap break-words">
                                {m.body}
                              </p>
                            )}
                            {m.attachments.map(a =>
                              a.kind === "image" && a.url ? (
                                <img
                                  key={a.storageId}
                                  src={a.url}
                                  alt={a.name}
                                  className="mt-1 max-h-64 rounded-lg"
                                />
                              ) : a.url ? (
                                <a
                                  key={a.storageId}
                                  href={a.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 flex items-center gap-1 underline"
                                >
                                  <Paperclip className="h-3 w-3" /> {a.name}
                                </a>
                              ) : null
                            )}
                            {m.linkPreviews.map(lp => (
                              <a
                                key={lp.url}
                                href={lp.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 block overflow-hidden rounded-lg border bg-background text-foreground"
                              >
                                {lp.image && (
                                  <img
                                    src={lp.image}
                                    alt=""
                                    className="h-28 w-full object-cover"
                                  />
                                )}
                                <span className="block p-2">
                                  <span className="block text-xs font-semibold">
                                    {lp.title}
                                  </span>
                                  {lp.description && (
                                    <span className="line-clamp-2 text-xs text-muted-foreground">
                                      {lp.description}
                                    </span>
                                  )}
                                </span>
                              </a>
                            ))}
                          </>
                        )}
                        <div
                          className={cn(
                            "mt-0.5 flex items-center gap-1 text-[10px] opacity-60",
                            mine && "justify-end"
                          )}
                        >
                          <span>{formatTime(m.createdAt, locale)}</span>
                          {m.edited && !m.deleted && (
                            <span>· {t("edited")}</span>
                          )}
                          {mine &&
                            !m.deleted &&
                            (seen ? (
                              <CheckCheck
                                className="h-3.5 w-3.5"
                                aria-label={t("seenBy", {
                                  names: m.seenBy.join(", "),
                                })}
                              />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            ))}
                        </div>
                      </div>

                      {!m.deleted && (
                        <div className="flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                          <ReactionPicker
                            onPick={emoji =>
                              void toggleReaction({ messageId: m._id, emoji })
                            }
                            side="top"
                            align={mine ? "end" : "start"}
                          />
                          {mine && (
                            <button
                              className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                              aria-label={tc("delete")}
                              onClick={() => void onDeleteMessage(m._id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {!m.deleted && m.reactions.length > 0 && (
                      <ReactionChips
                        reactions={m.reactions}
                        onToggle={emoji =>
                          void toggleReaction({ messageId: m._id, emoji })
                        }
                      />
                    )}
                  </div>
                </div>
              </Fragment>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Typing */}
      {typingNames.length > 0 && (
        <p className="px-4 pb-1 text-xs text-muted-foreground">
          {typingNames.length === 1
            ? t("typing", { name: typingNames[0] })
            : t("typingMany")}
        </p>
      )}

      {/* Composer */}
      <div className="border-t border-border/70 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-background p-1.5 shadow-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
          <label className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Paperclip className="h-5 w-5" />
            <input
              type="file"
              multiple
              className="hidden"
              onChange={e => setFiles(Array.from(e.target.files ?? []))}
            />
          </label>
          <div className="flex-1 self-center">
            {files.length > 0 && (
              <p className="mb-1 truncate px-1 text-xs text-muted-foreground">
                {files.map(f => f.name).join(", ")}
              </p>
            )}
            <Textarea
              value={body}
              onChange={e => onType(e.target.value)}
              placeholder={t("messagePlaceholder")}
              rows={1}
              className="min-h-9 resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
          </div>
          <Button
            size="icon"
            className="size-9 shrink-0 rounded-lg"
            onClick={send}
            disabled={sending}
            aria-label={t("send")}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizonal className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
