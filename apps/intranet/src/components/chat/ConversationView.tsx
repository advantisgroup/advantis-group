"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
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
import { motion, type PanInfo } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCheck,
  Cloud,
  Copy,
  ExternalLink,
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
import { useFileViewer } from "@/components/file-viewer/FileViewerProvider";
import { OneDrivePickerDialog } from "@/components/onedrive/OneDrivePickerDialog";
import { UserProfile } from "@/components/profile/UserProfile";
import { useCurrentUser } from "@/components/providers/current-user";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GroupAvatar } from "@/components/ui/avatar-stack";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ReactionChips, ReactionPicker } from "@/components/ui/reactions";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatTime, initials, relativeTime } from "@/lib/format";
import { pathToUrl } from "@/lib/onedrive-path";
import { formatFileSize, isImage, uploadToConvex } from "@/lib/upload";
import { cn } from "@/lib/utils";

const URL_RE = /https?:\/\/[^\s]+/i;
const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ??
  "http://localhost:3002";
const GROUP_WINDOW_MS = 5 * 60 * 1000;
/** Touch-and-hold duration before the mobile message action sheet opens. */
const LONG_PRESS_MS = 450;
/** Horizontal drag distance that counts as a swipe-to-reply on mobile. */
const SWIPE_REPLY_THRESHOLD = 56;
const COMPOSER_EMOJIS = [
  "😀",
  "😂",
  "😍",
  "😊",
  "😉",
  "😎",
  "🤔",
  "😮",
  "😢",
  "😡",
  "👍",
  "👎",
  "🙏",
  "👏",
  "🙌",
  "💪",
  "❤️",
  "🔥",
  "🎉",
  "✨",
  "✅",
  "❌",
  "💯",
  "👀",
];
/** Composer textarea grows with the message up to roughly 6 lines, then scrolls. */
const COMPOSER_MAX_HEIGHT = 160;

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
  const isMobile = useIsMobile();
  const { openFileViewer } = useFileViewer();

  // Reactive: this re-runs the moment access changes (left, removed, deleted,
  // or a stale `?c=` link), so it never throws — it reports a status instead.
  // `conversation` stays undefined for anything but the "ok" case, which keeps
  // all the rendering code below unchanged from before this existed.
  const conversationQuery = useQuery(api.chat.getConversation, {
    conversationId,
  });
  const conversation =
    conversationQuery?.status === "ok" ? conversationQuery : undefined;
  const unavailable =
    conversationQuery && conversationQuery.status !== "ok"
      ? conversationQuery.status
      : null;

  const { results, status, loadMore } = usePaginatedQuery(
    api.chat.getMessages,
    unavailable ? "skip" : { conversationId },
    { initialNumItems: 30 }
  );
  const typingNames =
    useQuery(api.chat.whoIsTyping, unavailable ? "skip" : { conversationId }) ??
    [];
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
  // OneDrive picks are imported server-side (Graph -> Convex, see
  // useOneDriveApi().importAttachment) and arrive already uploaded, so they
  // ride separately from `files` instead of round-tripping through the
  // browser as a File to re-upload.
  const [importedAttachments, setImportedAttachments] = useState<
    MessageAttachment[]
  >([]);
  // Attachments already on the message being edited; edited alongside any
  // newly-picked `files`/`importedAttachments` and merged back on save.
  const [editingAttachments, setEditingAttachments] = useState<
    Message["attachments"]
  >([]);
  const [oneDrivePickerOpen, setOneDrivePickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [profileId, setProfileId] = useState<Id<"users"> | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<{ id: Id<"messages"> } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [mention, setMention] = useState<{ query: string } | null>(null);
  // Mobile: message the long-press action sheet is currently open for.
  const [actionSheetMessage, setActionSheetMessage] = useState<Message | null>(
    null
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const atBottomRef = useRef(true);
  const lastTyping = useRef(0);
  const longPressTimer = useRef<number | null>(null);
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

  if (conversation && initialReadRef.current?.id !== conversationId) {
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

  // Grow the composer with multi-line messages instead of staying a fixed
  // single-line box, capping out at COMPOSER_MAX_HEIGHT and scrolling.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [body]);

  // Auto-scroll to newest when the reader is already near the bottom.
  useEffect(() => {
    if (atBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [results.length]);

  // A stale `?c=` link (left, removed, or the chat itself was deleted/purged)
  // — show a clear, distinct message instead of a blank or broken thread.
  if (unavailable) {
    return <ConversationUnavailable status={unavailable} onBack={onBack} />;
  }

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
    setMention(m && conversation?.type === "group" ? { query: m[1] } : null);
    const now = Date.now();
    if (now - lastTyping.current > 3000) {
      lastTyping.current = now;
      void setTyping({ conversationId });
    }
  }

  function pickMention(member: { _id: Id<"users">; name: string }) {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? body.length;
    const before = body
      .slice(0, caret)
      .replace(/@([\w]*)$/, `@${member.name} `);
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
    setEditingAttachments(m.attachments);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function cancelCompose() {
    setEditing(null);
    setReplyTo(null);
    setBody("");
    setFiles([]);
    setImportedAttachments([]);
    setEditingAttachments([]);
  }

  function addFiles(picked: File[]) {
    setFiles(prev => [...prev, ...picked]);
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  function removeEditingAttachment(storageId: string) {
    setEditingAttachments(prev => prev.filter(a => a.storageId !== storageId));
  }

  function removeImportedAttachment(storageId: string) {
    setImportedAttachments(prev => prev.filter(a => a.storageId !== storageId));
  }

  function addImportedAttachment(attachment: MessageAttachment) {
    setImportedAttachments(prev => [...prev, attachment]);
  }

  async function copyMessage(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("copied"));
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  async function uploadPendingFiles(): Promise<MessageAttachment[]> {
    const uploaded: MessageAttachment[] = [];
    for (const file of files) {
      const storageId = await uploadToConvex(() => generateUploadUrl({}), file);
      uploaded.push({
        storageId,
        kind: isImage(file) ? "image" : "file",
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
    }
    return uploaded;
  }

  function stripAttachmentUrl(
    a: Message["attachments"][number]
  ): MessageAttachment {
    const { url: _url, ...rest } = a;
    return rest;
  }

  async function send() {
    const text = body.trim();

    if (editing) {
      const remaining = editingAttachments.map(stripAttachmentUrl);
      if (
        !text &&
        remaining.length === 0 &&
        files.length === 0 &&
        importedAttachments.length === 0
      ) {
        return;
      }
      setSending(true);
      try {
        const uploaded = await uploadPendingFiles();
        const attachments = [...remaining, ...uploaded, ...importedAttachments];
        await editMessage({
          messageId: editing.id,
          body: text,
          attachments: attachments as never,
        });
        cancelCompose();
      } catch (e) {
        handleError(e);
      } finally {
        setSending(false);
      }
      return;
    }

    if (!text && files.length === 0 && importedAttachments.length === 0) {
      return;
    }
    setSending(true);
    try {
      const attachments = [
        ...(await uploadPendingFiles()),
        ...importedAttachments,
      ];
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
      setImportedAttachments([]);
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

  function clearLongPress() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  /** Touch-and-hold on a bubble opens the mobile action sheet (WhatsApp/
   *  Discord-style), instead of relying on the small hover-only icons. */
  function longPressHandlers(m: Message) {
    return {
      onPointerDown: (e: ReactPointerEvent) => {
        if (e.pointerType !== "touch") return;
        clearLongPress();
        longPressTimer.current = window.setTimeout(() => {
          longPressTimer.current = null;
          navigator.vibrate?.(10);
          setActionSheetMessage(m);
        }, LONG_PRESS_MS);
      },
      onPointerUp: clearLongPress,
      onPointerLeave: clearLongPress,
      onPointerCancel: clearLongPress,
      onPointerMove: clearLongPress,
    };
  }

  function swipeToReply(m: Message) {
    setEditing(null);
    setReplyTo(m);
    requestAnimationFrame(() => textareaRef.current?.focus());
    navigator.vibrate?.(10);
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

  const membersTrigger = conversation?.type === "group" && (
    <button
      type="button"
      onClick={() => setMembersOpen(true)}
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
  );

  const membersList = conversation?.type === "group" && (
    <>
      {conversation.members.map(m => (
        <button
          key={m._id}
          type="button"
          onClick={() => {
            setMembersOpen(false);
            if (m._id !== me._id) setProfileId(m._id);
          }}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent active:bg-accent disabled:opacity-60"
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
    </>
  );

  const conversationOptionsItems: ActionMenuItem[] = conversation
    ? [
        {
          key: "mute",
          label: conversation.muted ? t("unmute") : t("mute"),
          onSelect: () =>
            void toggleMute({ conversationId }).catch(handleError),
        },
        { key: "sep", separator: true },
        {
          key: "leave",
          label:
            conversation.type === "group" ? t("leaveGroup") : t("leaveChat"),
          icon: <LogOut />,
          destructive: true,
          onSelect: () => void onLeave(),
        },
      ]
    : [];

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
          isMobile ? (
            membersTrigger
          ) : (
            <Popover open={membersOpen} onOpenChange={setMembersOpen}>
              <PopoverTrigger asChild>{membersTrigger}</PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-1.5">
                <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {conversation.members.length} {t("members")}
                </p>
                <div className="max-h-72 space-y-0.5 overflow-y-auto">
                  {membersList}
                </div>
              </PopoverContent>
            </Popover>
          )
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
            <ActionMenu
              ariaLabel={t("conversationOptions")}
              items={conversationOptionsItems}
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("conversationOptions")}
                >
                  <MoreVertical className="h-5 w-5" />
                </Button>
              }
            />
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
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto p-4"
      >
        {conversation && messages.length === 0 ? (
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
        ) : (
          // min-h-full + justify-end so a short thread sits against the
          // composer like a real chat, instead of pinned to the top with
          // dead space below — only kicks in when content doesn't already
          // overflow, so normal scrolling is unaffected.
          <div className="flex min-h-full flex-col justify-end">
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
                              <AvatarImage
                                src={m.senderAvatar}
                                alt={m.senderName}
                              />
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
                        <motion.div
                          className={cn(
                            "flex items-center gap-1",
                            mine && "flex-row-reverse"
                          )}
                          drag={isMobile && !m.deleted ? "x" : false}
                          dragConstraints={{ left: 0, right: 0 }}
                          dragElastic={0.5}
                          dragMomentum={false}
                          onDragEnd={(_e, info: PanInfo) => {
                            if (
                              Math.abs(info.offset.x) > SWIPE_REPLY_THRESHOLD
                            ) {
                              swipeToReply(m);
                            }
                          }}
                        >
                          <div
                            className={cn(
                              "min-w-0 rounded-2xl px-3 py-2 text-sm",
                              mine
                                ? "rounded-br-md bg-blue-500/15 text-foreground"
                                : "rounded-bl-md bg-muted"
                            )}
                            {...(isMobile && !m.deleted
                              ? longPressHandlers(m)
                              : {})}
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
                                className="mb-1 flex w-full flex-col rounded-md border-l-2 border-blue-500/60 bg-background/60 px-2 py-1 text-left text-xs"
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
                              <p className="italic opacity-70">
                                {t("deleted")}
                              </p>
                            ) : (
                              <>
                                {m.body && (
                                  <p className="whitespace-pre-wrap break-words">
                                    {highlightBody(m.body, m.mentions)}
                                  </p>
                                )}
                                {m.attachments.map(a => {
                                  const fromOneDrive = Boolean(a.oneDrivePath);
                                  if (a.kind === "image" && a.url) {
                                    return (
                                      <button
                                        type="button"
                                        key={a.storageId}
                                        onClick={() =>
                                          fromOneDrive
                                            ? (window.location.href = pathToUrl(
                                                a.oneDrivePath!
                                              ))
                                            : openFileViewer({
                                                storageId: a.storageId,
                                                name: a.name,
                                                contentType: a.contentType,
                                                size: a.size,
                                                width: a.width,
                                                height: a.height,
                                                url: a.url ?? undefined,
                                              })
                                        }
                                        className="relative mt-1 block"
                                      >
                                        <img
                                          src={a.url}
                                          alt={a.name}
                                          className="max-h-64 rounded-lg"
                                        />
                                        {fromOneDrive && (
                                          <span
                                            title={tc("fromOneDrive")}
                                            className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-background/90 shadow ring-1 ring-border"
                                          >
                                            <Cloud className="size-3.5 text-blue-500" />
                                          </span>
                                        )}
                                      </button>
                                    );
                                  }
                                  if (!a.url) return null;
                                  if (fromOneDrive) {
                                    return (
                                      <a
                                        key={a.storageId}
                                        href={pathToUrl(a.oneDrivePath!)}
                                        className="mt-1 flex items-center gap-1 underline"
                                      >
                                        <Cloud className="h-3 w-3 text-blue-500" />
                                        {a.name}
                                        <ExternalLink className="h-3 w-3 text-blue-500" />
                                      </a>
                                    );
                                  }
                                  return (
                                    <button
                                      type="button"
                                      key={a.storageId}
                                      onClick={() =>
                                        openFileViewer({
                                          storageId: a.storageId,
                                          name: a.name,
                                          contentType: a.contentType,
                                          size: a.size,
                                          width: a.width,
                                          height: a.height,
                                          url: a.url ?? undefined,
                                        })
                                      }
                                      className="mt-1 flex items-center gap-1 text-left underline"
                                    >
                                      <Paperclip className="h-3 w-3" />
                                      {a.name}
                                    </button>
                                  );
                                })}
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
                                  void toggleReaction({
                                    messageId: m._id,
                                    emoji,
                                  })
                                }
                                side="top"
                                align={mine ? "end" : "start"}
                              />
                              {/* On mobile the long-press action sheet covers
                                  reply/copy/edit/delete instead — this small
                                  icon is easy to mis-tap on a touch screen. */}
                              {!isMobile && (
                                <MessageMenu
                                  canEdit={
                                    mine &&
                                    (!!m.body || m.attachments.length > 0)
                                  }
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
                              )}
                            </div>
                          )}
                        </motion.div>

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
        )}
      </div>

      {/* Jump to bottom */}
      {showJump && (
        <button
          onClick={scrollToBottom}
          aria-label={t("jumpToBottom")}
          className="absolute right-5 flex size-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-transform hover:scale-105"
          style={{ bottom: "calc(6rem + env(safe-area-inset-bottom))" }}
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
      <div
        className="border-t border-border/70 p-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        {(replyTo || editing) && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-1.5 text-xs">
            {editing ? (
              <Pencil className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            ) : (
              <Reply className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-blue-500">
                {editing
                  ? t("editingMessage")
                  : t("replyingTo", {
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

          <label className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:size-9">
            <Paperclip className="h-5 w-5" />
            <input
              type="file"
              multiple
              className="hidden"
              onChange={e => {
                addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>

          <button
            type="button"
            aria-label={tc("fromOneDrive")}
            title={tc("fromOneDrive")}
            onClick={() => setOneDrivePickerOpen(true)}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:size-9"
          >
            <Cloud className="h-5 w-5" />
          </button>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t("emoji")}
                className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:size-9"
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

          <div className="min-w-0 flex-1 self-center">
            {(editingAttachments.length > 0 ||
              files.length > 0 ||
              importedAttachments.length > 0) && (
              <div className="mb-1.5 flex flex-wrap gap-1.5 px-1">
                {editingAttachments.map(a => (
                  <AttachmentChip
                    key={a.storageId}
                    name={a.name}
                    size={a.size}
                    isImage={a.kind === "image"}
                    thumbnailUrl={a.url}
                    fromOneDrive={!!a.oneDrivePath}
                    onRemove={() => removeEditingAttachment(a.storageId)}
                    removeLabel={tc("delete")}
                  />
                ))}
                {files.map((f, i) => (
                  <AttachmentChip
                    key={`${f.name}-${i}`}
                    name={f.name}
                    size={f.size}
                    isImage={isImage(f)}
                    file={f}
                    onRemove={() => removeFile(i)}
                    removeLabel={tc("delete")}
                  />
                ))}
                {importedAttachments.map(a => (
                  <AttachmentChip
                    key={a.storageId}
                    name={a.name}
                    size={a.size}
                    isImage={a.kind === "image"}
                    fromOneDrive
                    onRemove={() => removeImportedAttachment(a.storageId)}
                    removeLabel={tc("delete")}
                  />
                ))}
              </div>
            )}
            <Textarea
              ref={textareaRef}
              value={body}
              onChange={e => onType(e.target.value)}
              placeholder={t("messagePlaceholder")}
              rows={1}
              className="min-h-9 resize-none overflow-y-auto border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
              style={{ maxHeight: COMPOSER_MAX_HEIGHT }}
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
            className="size-10 shrink-0 rounded-lg md:size-9"
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

      {conversation?.type === "group" && isMobile && (
        <MobileDrawer
          open={membersOpen}
          onOpenChange={setMembersOpen}
          ariaLabel={`${conversation.members.length} ${t("members")}`}
        >
          <div className="px-4 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {conversation.members.length} {t("members")}
            </p>
          </div>
          <div className="space-y-0.5 px-2 pb-2">{membersList}</div>
        </MobileDrawer>
      )}

      {isMobile && (
        <MobileDrawer
          open={!!actionSheetMessage}
          onOpenChange={o => {
            if (!o) setActionSheetMessage(null);
          }}
          ariaLabel={t("reply")}
        >
          {actionSheetMessage && (
            <div className="space-y-0.5 px-2 pb-2 pt-1">
              <ActionSheetItem
                icon={<Reply className="size-4" />}
                label={t("reply")}
                onClick={() => {
                  const m = actionSheetMessage;
                  setActionSheetMessage(null);
                  swipeToReply(m);
                }}
              />
              <ActionSheetItem
                icon={<Copy className="size-4" />}
                label={tc("copy")}
                onClick={() => {
                  void copyMessage(actionSheetMessage.body);
                  setActionSheetMessage(null);
                }}
              />
              {actionSheetMessage.senderId === me._id &&
                (!!actionSheetMessage.body ||
                  actionSheetMessage.attachments.length > 0) && (
                  <ActionSheetItem
                    icon={<Pencil className="size-4" />}
                    label={tc("edit")}
                    onClick={() => {
                      const m = actionSheetMessage;
                      setActionSheetMessage(null);
                      startEdit(m);
                    }}
                  />
                )}
              {actionSheetMessage.senderId === me._id && (
                <ActionSheetItem
                  icon={<Trash2 className="size-4" />}
                  label={tc("delete")}
                  destructive
                  onClick={() => {
                    const id = actionSheetMessage._id;
                    setActionSheetMessage(null);
                    void onDeleteMessage(id);
                  }}
                />
              )}
            </div>
          )}
        </MobileDrawer>
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

      <OneDrivePickerDialog
        open={oneDrivePickerOpen}
        onOpenChange={setOneDrivePickerOpen}
        onImport={addImportedAttachment}
      />
    </div>
  );
}

/** Shown in place of the thread when a stale `?c=` link no longer resolves —
 *  distinguishes a fully deleted conversation from one the caller just isn't
 *  part of anymore (left, removed, or an unrelated link). */
function ConversationUnavailable({
  status,
  onBack,
}: {
  status: "deleted" | "not_found";
  onBack: () => void;
}) {
  const t = useTranslations("Chat");
  const deleted = status === "deleted";
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-1"
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          {deleted ? (
            <Trash2 className="h-7 w-7" />
          ) : (
            <LogOut className="h-7 w-7" />
          )}
        </span>
        <div className="max-w-xs">
          <p className="text-base font-semibold text-foreground">
            {deleted ? t("conversationDeleted") : t("conversationNotFound")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {deleted
              ? t("conversationDeletedHint")
              : t("conversationNotFoundHint")}
          </p>
        </div>
        <Button onClick={onBack}>{t("backToChats")}</Button>
      </div>
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
  const items: ActionMenuItem[] = [
    { key: "reply", label: labels.reply, icon: <Reply />, onSelect: onReply },
    { key: "copy", label: labels.copy, icon: <Copy />, onSelect: onCopy },
    ...(canEdit
      ? [
          {
            key: "edit",
            label: labels.edit,
            icon: <Pencil />,
            onSelect: onEdit,
          } satisfies ActionMenuItem,
        ]
      : []),
    ...(canDelete
      ? [
          {
            key: "delete",
            label: labels.delete,
            icon: <Trash2 />,
            destructive: true,
            onSelect: onDelete,
          } satisfies ActionMenuItem,
        ]
      : []),
  ];

  return (
    <ActionMenu
      ariaLabel={labels.reply}
      items={items}
      trigger={
        <button
          className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={labels.reply}
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      }
    />
  );
}

/** One row in the mobile long-press message action sheet. */
function ActionSheetItem({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent",
        destructive && "text-destructive"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** A pending or already-uploaded attachment shown in the composer, with an
 *  image thumbnail when available so you can see what you're about to send
 *  instead of just a filename. */
function AttachmentChip({
  name,
  size,
  isImage: isImageKind,
  thumbnailUrl,
  file,
  fromOneDrive,
  onRemove,
  removeLabel,
}: {
  name: string;
  size?: number;
  isImage: boolean;
  thumbnailUrl?: string | null;
  file?: File;
  fromOneDrive?: boolean;
  onRemove: () => void;
  removeLabel: string;
}) {
  const objectUrl = useMemo(
    () => (file && isImageKind ? URL.createObjectURL(file) : null),
    [file, isImageKind]
  );
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const src = thumbnailUrl ?? objectUrl;

  return (
    <div className="flex max-w-56 items-center gap-2 rounded-lg border border-border/60 bg-background py-1 pl-1 pr-2 text-xs">
      {isImageKind && src ? (
        <img
          src={src}
          alt=""
          className="size-8 shrink-0 rounded object-cover"
        />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
          {fromOneDrive ? (
            <Cloud className="size-3.5" />
          ) : (
            <Paperclip className="size-3.5" />
          )}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {size != null && (
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {formatFileSize(size)}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
