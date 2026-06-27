"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  ArrowLeft,
  Loader2,
  Paperclip,
  SendHorizonal,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import {
  type LinkPreview,
  type MessageAttachment,
  type UnfurlResult,
} from "@advantis/types";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { formatTime, initials } from "@/lib/format";
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
  const locale = useLocale();
  const me = useCurrentUser();
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
  const markRead = useMutation(api.chat.markRead);
  const setTyping = useMutation(api.chat.setTyping);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastTyping = useRef(0);

  const messages = [...results].reverse();

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
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b p-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <p className="font-semibold">{conversation?.title}</p>
          {conversation?.type === "group" && (
            <p className="text-xs text-muted-foreground">
              {conversation.members.length} {t("members")}
            </p>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {status === "CanLoadMore" && (
          <div className="mb-2 flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => loadMore(30)}>
              {t("title")}…
            </Button>
          </div>
        )}
        <div className="space-y-3">
          {messages.map(m => {
            const mine = m.senderId === me._id;
            return (
              <div
                key={m._id}
                className={cn("flex gap-2", mine && "flex-row-reverse")}
              >
                {!mine && (
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="text-[10px]">
                      {initials(m.senderName)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    "group max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                    mine ? "bg-primary text-primary-foreground" : "bg-muted"
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
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] opacity-60">
                    <span>{formatTime(m.createdAt, locale)}</span>
                    {m.edited && !m.deleted && <span>· {t("edited")}</span>}
                    {mine && !m.deleted && (
                      <button
                        className="opacity-0 transition group-hover:opacity-100"
                        aria-label="Delete"
                        onClick={() => void deleteMessage({ messageId: m._id })}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
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
      <div className="flex items-end gap-2 border-t p-3">
        <label className="cursor-pointer text-muted-foreground hover:text-foreground">
          <Paperclip className="h-5 w-5" />
          <input
            type="file"
            multiple
            className="hidden"
            onChange={e => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>
        <div className="flex-1">
          {files.length > 0 && (
            <p className="mb-1 truncate text-xs text-muted-foreground">
              {files.map(f => f.name).join(", ")}
            </p>
          )}
          <Textarea
            value={body}
            onChange={e => onType(e.target.value)}
            placeholder={t("messagePlaceholder")}
            rows={1}
            className="min-h-9 resize-none"
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
          onClick={send}
          disabled={sending}
          aria-label={t("title")}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SendHorizonal className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
