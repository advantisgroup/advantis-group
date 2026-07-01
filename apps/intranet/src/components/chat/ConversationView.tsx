"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import {
  type LinkPreview,
  type MessageAttachment,
  type UnfurlResult,
} from "@advantis/types";
import { useAuth } from "@clerk/nextjs";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import {
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCheck,
  Copy,
  Loader2,
  LogOut,
  MoreVertical,
  Paperclip,
  Pencil,
  Reply,
  SendHorizonal,
  Settings,
  Smile,
  Trash2,
  UploadCloud,
  UserPlus,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { GroupSettingsDialog } from "@/components/chat/GroupSettingsDialog";
import { UserProfile } from "@/components/profile/UserProfile";
import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GroupAvatar } from "@/components/ui/avatar-stack";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, useConfirm } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ReactionChips, ReactionPicker } from "@/components/ui/reactions";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatTime, initials, relativeTime } from "@/lib/format";
import { isImage, uploadToConvex } from "@/lib/upload";
import { cn } from "@/lib/utils";

const URL_RE = /https?:\/\/[^\s]+/i;
const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ??
  "http://localhost:3002";
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const COMPOSER_EMOJIS = [
  "😀", "😂", "😍", "😊", "😉", "😎", "🤔", "😮",
  "😢", "😡", "👍", "👎", "🙏", "👏", "🙌", "💪",
  "❤️", "🔥", "🎉", "✨", "✅", "❌", "💯", "👀",
];

type Message = FunctionReturnType<typeof api.chat.getMessages>["page"][number];

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
  const editMessage = useMutation(api.chat.editMessage);
  const deleteMessage = useMutation(api.chat.deleteMessage);
  const toggleReaction = useMutation(api.chat.toggleReaction);
  const markRead = useMutation(api.chat.markRead);
  const setTyping = useMutation(api.chat.setTyping);
  const reinviteDm = useMutation(api.chat.reinviteDm);
  const leaveConversation = useMutation(api.chat.leaveConversation);
  const toggleMute = useMutation(api.chat.toggleMute);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const handleError = useErrorHandler();

  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [profileId, setProfileId] = useState<Id<"users"> | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<{ id: Id<"messages"> } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [mention, setMention] = useState<{ query: string } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const atBottomRef = useRef(true);
  const lastTyping = useRef(0);
  const mentionedRef = useRef<Map<string, Id<"users">>>(new Map());
  // Freeze the read cursor on first open so the "new messages" divider is stable.
  const initialReadRef = useRef<{ id: string; at: number } | null>(null);

  const messages = useMemo(() => [...results].reverse(), [results]);

  const other =
    conversation?.type === "dm"
      ? conversation.members.find(m => m._id !== me._id)
      : undefined;
  const online =
    !!other?.lastActiveAt && Date.now() - other.lastActiveAt < 90_000;

  const mentionableMembers = useMemo(() => {
    if (!conversation || conversation.type !== "group" || !mention) return [];
    const q = mention.query.toLowerCase();
    return conversation.members
      .filter(m => m._id !== me._id && m.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [conversation, mention, me._id]);

  // Names to highlight (@mentions) — resolved from ids returned per message.
  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    conversation?.members.forEach(m => map.set(m._id, m.name));
    return map;
  }, [conversation]);

  if (
    conversation &&
    initialReadRef.current?.id !== conversationId
  ) {
    initialReadRef.current = {
      id: conversationId,
      at: conversation.myLastReadAt,
    };
  }
  const firstUnreadId = useMemo(() => {
    const cursor = initialReadRef.current?.at ?? 0;
    const first = messages.find(
      m => m.createdAt > cursor && m.senderId !== me._id
    );
    return first?._id ?? null;
  }, [messages, me._id]);

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

  // Auto-scroll to newest when the reader is already near the bottom.
  useEffect(() => {
    if (atBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [results.length]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = distance < 120;
    setShowJump(distance > 320);
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function onType(value: string) {
    setBody(value);
    // @mention autocomplete: look at the token immediately before the caret.
    const caret = textareaRef.current?.selectionStart ?? value.length;
    const upto = value.slice(0, caret);
    const m = /(?:^|\s)@([\w]*)$/.exec(upto);
    setMention(
      m && conversation?.type === "group" ? { query: m[1] } : null
    );
    const now = Date.now();
    if (now - lastTyping.current > 3000) {
      lastTyping.current = now;
      void setTyping({ conversationId });
    }
  }

  function pickMention(member: { _id: Id<"users">; name: string }) {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? body.length;
    const before = body.slice(0, caret).replace(/@([\w]*)$/, `@${member.name} `);
    const after = body.slice(caret);
    mentionedRef.current.set(member.name, member._id);
    setBody(before + after);
    setMention(null);
    requestAnimationFrame(() => el?.focus());
  }

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? body.length;
    setBody(body.slice(0, caret) + emoji + body.slice(caret));
    requestAnimationFrame(() => el?.focus());
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

  function startEdit(m: Message) {
    setEditing({ id: m._id });
    setReplyTo(null);
    setBody(m.body);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function cancelCompose() {
    setEditing(null);
    setReplyTo(null);
    setBody("");
    setFiles([]);
  }

  async function copyMessage(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("copied"));
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  async function send() {
    const text = body.trim();

    if (editing) {
      try {
        await editMessage({ messageId: editing.id, body: text });
        cancelCompose();
      } catch (e) {
        handleError(e);
      }
      return;
    }

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
      const mentions = [...mentionedRef.current.entries()]
        .filter(([name]) => text.includes(`@${name}`))
        .map(([, id]) => id);
      await sendMessage({
        conversationId,
        body: text,
        attachments: attachments as never,
        linkPreviews,
        replyToId: replyTo?._id,
        mentions: mentions.length ? mentions : undefined,
      });
      setBody("");
      setFiles([]);
      setReplyTo(null);
      mentionedRef.current.clear();
      atBottomRef.current = true;
    } catch (e) {
      handleError(e);
    } finally {
      setSending(false);
    }
  }

  async function onReinvite() {
    try {
      await reinviteDm({ conversationId });
      toast.success(t("reinvited"));
    } catch (e) {
      handleError(e);
    }
  }

  async function onLeave() {
    const isGroup = conversation?.type === "group";
    const ok = await confirm({
      title: isGroup ? t("leaveGroup") : t("leaveChat"),
      description: isGroup ? t("leaveGroupHint") : t("leaveChatHint"),
      confirmLabel: isGroup ? t("leaveGroup") : t("leaveChat"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    try {
      await leaveConversation({ conversationId });
      onBack();
    } catch (e) {
      handleError(e);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length) setFiles(prev => [...prev, ...dropped]);
  }

  function highlightBody(text: string, mentionIds: string[]): ReactNode {
    if (mentionIds.length === 0) return text;
    const names = mentionIds
      .map(id => memberNameById.get(id))
      .filter((n): n is string => !!n);
    if (names.length === 0) return text;
    const pattern = new RegExp(
      `(@(?:${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`,
      "g"
    );
    return text.split(pattern).map((part, i) =>
      names.some(n => part === `@${n}`) ? (
        <span key={i} className="font-semibold text-blue-500">
          {part}
        </span>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      )
    );
  }

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={e => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={e => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
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
        {conversation?.type === "group" ? (
          <Popover open={membersOpen} onOpenChange={setMembersOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="-my-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 pr-2 text-left transition-colors hover:bg-accent/50"
              >
                <GroupAvatar
                  src={conversation.groupAvatar}
                  memberAvatars={conversation.members
                    .filter(m => m._id !== me._id)
                    .map(m => m.avatar)}
                  memberNames={conversation.members
                    .filter(m => m._id !== me._id)
                    .map(m => m.name)}
                  name={conversation.title}
                  className="size-9"
                />
                <div className="min-w-0">
                  <p className="truncate font-semibold leading-tight">
                    {conversation.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {conversation.members.length} {t("members")}
                  </p>
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-1.5">
              <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {conversation.members.length} {t("members")}
              </p>
              <div className="max-h-72 space-y-0.5 overflow-y-auto">
                {conversation.members.map(m => (
                  <button
                    key={m._id}
                    type="button"
                    onClick={() => {
                      setMembersOpen(false);
                      if (m._id !== me._id) setProfileId(m._id);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent disabled:opacity-60"
                    disabled={m._id === me._id}
                  >
                    <Avatar className="size-7 shrink-0">
                      {m.avatar && <AvatarImage src={m.avatar} alt={m.name} />}
                      <AvatarFallback className="text-[10px]">
                        {initials(m.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {m.name}
                      {m._id === me._id ? ` (${t("you")})` : ""}
                    </span>
                    {m.isCreator && (
                      <span className="text-[10px] text-muted-foreground">
                        {t("creator")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <button
            type="button"
            onClick={() => other && setProfileId(other._id)}
            disabled={!other}
            className="-my-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 pr-2 text-left transition-colors hover:bg-accent/50 disabled:cursor-default disabled:hover:bg-transparent"
          >
            <div className="relative shrink-0">
              <Avatar className="size-9">
                {conversation?.avatar && (
                  <AvatarImage
                    src={conversation.avatar}
                    alt={conversation.title}
                  />
                )}
                <AvatarFallback className="text-xs">
                  {initials(conversation?.title ?? "")}
                </AvatarFallback>
              </Avatar>
              {online && (
                <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-card bg-success" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold leading-tight">
                {conversation?.title}
              </p>
              {conversation?.dmOtherLeft ? (
                <p className="truncate text-xs italic text-muted-foreground">
                  {t("leftChatShort")}
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
          </button>
        )}

        {/* Header actions */}
        <div className="flex shrink-0 items-center gap-1">
          {conversation?.type === "group" && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("groupSettings")}
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-5 w-5" />
            </Button>
          )}
          {conversation && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("conversationOptions")}
                >
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    void toggleMute({ conversationId }).catch(handleError)
                  }
                >
                  {conversation.muted ? t("unmute") : t("mute")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={onLeave}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {conversation.type === "group"
                    ? t("leaveGroup")
                    : t("leaveChat")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* DM-left banner */}
      {conversation?.dmOtherLeft && (
        <div className="mx-3 mt-3 flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
            <UserPlus className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {t("leftChat", { name: conversation.dmPartner?.name ?? "" })}
            </p>
            {conversation.deleteAt && (
              <p className="text-xs text-muted-foreground">
                {t("autoDeletesIn", {
                  time: relativeTime(2 * Date.now() - conversation.deleteAt),
                })}
              </p>
            )}
          </div>
          <Button size="sm" className="shrink-0" onClick={onReinvite}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            {t("reinvite")}
          </Button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-4">
        {status === "CanLoadMore" && (
          <div className="mb-2 flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => loadMore(30)}>
              {t("loadMore")}
            </Button>
          </div>
        )}

        {conversation && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-blue-500/10 text-2xl">
              👋
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t("noMessages")}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {conversation.type === "group"
                  ? t("noMessagesGroupHint", { name: conversation.title })
                  : t("noMessagesHint", {
                      name: conversation.dmPartner?.name ?? conversation.title,
                    })}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((m, i) => {
            const mine = m.senderId === me._id;
            const prev = messages[i - 1];
            const grouped =
              !!prev &&
              prev.senderId === m.senderId &&
              !prev.deleted &&
              m.createdAt - prev.createdAt < GROUP_WINDOW_MS &&
              new Date(prev.createdAt).toDateString() ===
                new Date(m.createdAt).toDateString();
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
                {firstUnreadId === m._id && (
                  <div className="flex items-center gap-2 py-1">
                    <span className="h-px flex-1 bg-blue-500/30" />
                    <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-500">
                      {t("newMessages")}
                    </span>
                    <span className="h-px flex-1 bg-blue-500/30" />
                  </div>
                )}
                <div
                  id={`msg-${m._id}`}
                  className={cn(
                    "group flex gap-2 scroll-mt-4",
                    mine && "flex-row-reverse",
                    grouped ? "mt-0.5" : "mt-3"
                  )}
                >
                  {!mine &&
                    (grouped ? (
                      <span className="w-7 shrink-0" />
                    ) : (
                      <Avatar className="mt-auto h-7 w-7 shrink-0">
                        {m.senderAvatar ? (
                          <AvatarImage src={m.senderAvatar} alt={m.senderName} />
                        ) : null}
                        <AvatarFallback className="text-[10px]">
                          {initials(m.senderName)}
                        </AvatarFallback>
                      </Avatar>
                    ))}
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
                        {!mine &&
                          conversation?.type === "group" &&
                          !grouped && (
                            <p className="mb-0.5 text-xs font-semibold text-blue-500">
                              {m.senderName}
                            </p>
                          )}
                        {m.replyTo && (
                          <button
                            type="button"
                            onClick={() =>
                              document
                                .getElementById(`msg-${m.replyTo!._id}`)
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                })
                            }
                            className={cn(
                              "mb-1 flex w-full flex-col rounded-md border-l-2 px-2 py-1 text-left text-xs",
                              mine
                                ? "border-primary-foreground/50 bg-primary-foreground/10"
                                : "border-blue-500/60 bg-background/60"
                            )}
                          >
                            <span className="font-semibold opacity-80">
                              {m.replyTo.senderName}
                            </span>
                            <span className="truncate opacity-70">
                              {m.replyTo.deleted
                                ? t("deleted")
                                : m.replyTo.body || t("attachment")}
                            </span>
                          </button>
                        )}
                        {m.deleted ? (
                          <p className="italic opacity-70">{t("deleted")}</p>
                        ) : (
                          <>
                            {m.body && (
                              <p className="whitespace-pre-wrap break-words">
                                {highlightBody(m.body, m.mentions)}
                              </p>
                            )}
                            {m.attachments.map(a =>
                              a.kind === "image" && a.url ? (
                                <button
                                  type="button"
                                  key={a.storageId}
                                  onClick={() => setLightbox(a.url)}
                                  className="mt-1 block"
                                >
                                  <img
                                    src={a.url}
                                    alt={a.name}
                                    className="max-h-64 rounded-lg"
                                  />
                                </button>
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
                          <MessageMenu
                            canEdit={mine && !!m.body}
                            canDelete={mine}
                            onReply={() => {
                              setEditing(null);
                              setReplyTo(m);
                              textareaRef.current?.focus();
                            }}
                            onCopy={() => void copyMessage(m.body)}
                            onEdit={() => startEdit(m)}
                            onDelete={() => void onDeleteMessage(m._id)}
                            labels={{
                              reply: t("reply"),
                              copy: tc("copy"),
                              edit: tc("edit"),
                              delete: tc("delete"),
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Group seen-by avatars on the reader side. */}
                    {mine &&
                      !m.deleted &&
                      conversation?.type === "group" &&
                      m.seenByUsers.length > 0 && (
                        <div className="flex -space-x-1.5 pr-1">
                          {m.seenByUsers.slice(0, 4).map(u => (
                            <Avatar
                              key={u._id}
                              className="size-4 border border-card"
                            >
                              {u.avatar && (
                                <AvatarImage src={u.avatar} alt={u.name} />
                              )}
                              <AvatarFallback className="text-[7px]">
                                {initials(u.name)}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                      )}

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
      </div>

      {/* Jump to bottom */}
      {showJump && (
        <button
          onClick={scrollToBottom}
          aria-label={t("jumpToBottom")}
          className="absolute bottom-24 right-5 flex size-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-transform hover:scale-105"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}

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
        {(replyTo || editing) && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-1.5 text-xs">
            {editing ? (
              <Pencil className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            ) : (
              <Reply className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-blue-500">
                {editing ? t("editingMessage") : t("replyingTo", {
                  name: replyTo?.senderName ?? "",
                })}
              </p>
              {replyTo && (
                <p className="truncate text-muted-foreground">
                  {replyTo.body || t("attachment")}
                </p>
              )}
            </div>
            <button
              aria-label={tc("cancel")}
              onClick={cancelCompose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="relative flex items-end gap-2 rounded-xl border border-border bg-background p-1.5 shadow-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
          {/* @mention autocomplete */}
          {mention && mentionableMembers.length > 0 && (
            <div className="absolute bottom-full left-0 mb-2 w-64 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
              {mentionableMembers.map(m => (
                <button
                  key={m._id}
                  type="button"
                  onClick={() => pickMention(m)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-accent"
                >
                  <Avatar className="size-6">
                    {m.avatar && <AvatarImage src={m.avatar} alt={m.name} />}
                    <AvatarFallback className="text-[9px]">
                      {initials(m.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm">{m.name}</span>
                </button>
              ))}
            </div>
          )}

          {!editing && (
            <label className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Paperclip className="h-5 w-5" />
              <input
                type="file"
                multiple
                className="hidden"
                onChange={e => setFiles(Array.from(e.target.files ?? []))}
              />
            </label>
          )}

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t("emoji")}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Smile className="h-5 w-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" className="w-64 p-2">
              <div className="grid grid-cols-8 gap-0.5">
                {COMPOSER_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => insertEmoji(emoji)}
                    className="flex size-7 items-center justify-center rounded text-lg transition-transform hover:scale-125 hover:bg-accent"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex-1 self-center">
            {files.length > 0 && (
              <p className="mb-1 truncate px-1 text-xs text-muted-foreground">
                {files.map(f => f.name).join(", ")}
              </p>
            )}
            <Textarea
              ref={textareaRef}
              value={body}
              onChange={e => onType(e.target.value)}
              placeholder={t("messagePlaceholder")}
              rows={1}
              className="min-h-9 resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey && !mention) {
                  e.preventDefault();
                  void send();
                }
                if (e.key === "Escape" && (replyTo || editing)) cancelCompose();
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

      {/* Drag-and-drop overlay */}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-500/5 px-12 py-10 text-center">
            <UploadCloud className="size-10 text-blue-400" />
            <p className="text-sm font-medium text-foreground">
              {t("dropToSend")}
            </p>
          </div>
        </div>
      )}

      {conversation?.type === "group" && (
        <GroupSettingsDialog
          conversationId={conversationId}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onLeftOrDeleted={onBack}
        />
      )}

      <UserProfile
        userId={profileId}
        open={!!profileId}
        onOpenChange={o => {
          if (!o) setProfileId(null);
        }}
      />

      {/* Image lightbox */}
      <Dialog open={!!lightbox} onOpenChange={o => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl border-0 bg-transparent p-0 shadow-none">
          {lightbox && (
            <img
              src={lightbox}
              alt=""
              className="max-h-[85vh] w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessageMenu({
  canEdit,
  canDelete,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  labels,
}: {
  canEdit: boolean;
  canDelete: boolean;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  labels: { reply: string; copy: string; edit: string; delete: string };
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={labels.reply}
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onReply}>
          <Reply className="mr-2 h-4 w-4" />
          {labels.reply}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCopy}>
          <Copy className="mr-2 h-4 w-4" />
          {labels.copy}
        </DropdownMenuItem>
        {canEdit && (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            {labels.edit}
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {labels.delete}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
