"use client";

import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Globe,
  Loader2,
  MoreHorizontal,
  PanelLeft,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  RotateCcw,
  Search,
  Square,
  SquarePen,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { aiErrorKey } from "@/components/ai/AiRunCard";
import { useAiRun } from "@/components/ai/use-ai-run";
import { Mark } from "@/components/branding/ProviderMark";
import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { ApiResponseError, useIntranetApiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import {
  AssistantMessage,
  AttachmentChip,
  type ChatAttachment,
  type ChatMessage,
  type ChatStep,
  rememberImage,
  UserMessage,
} from "./wiki-chat-message";

interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  pinnedAt: number | null;
}

const WEB_KEY = "wikiChat.web";
const DAY_MS = 86_400_000;

/** Mirrors the limits in apps/api's wiki-chat route. */
const ACCEPT =
  "application/pdf,image/png,image/jpeg,image/gif,image/webp,text/plain,text/csv,text/markdown,.pdf,.txt,.md,.csv";
const MAX_FILES = 5;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;

function acceptable(file: File) {
  return (
    /^(application\/pdf|image\/(png|jpeg|gif|webp)|text\/(plain|csv|markdown))$/.test(file.type) ||
    /\.(pdf|txt|md|csv)$/i.test(file.name)
  );
}

/** A file picked for the next question: uploading, ready (it has a token) or
 * failed. */
interface PendingFile extends ChatAttachment {
  id: string;
  preview?: string;
  progress: number;
  token?: string;
  failed?: boolean;
}

function readWebSetting() {
  try {
    return localStorage.getItem(WEB_KEY) === "1";
  } catch {
    return false;
  }
}

function useGreeting() {
  const t = useTranslations("Guidebooks.wikiChat.greeting");
  const user = useCurrentUser();
  const hour = new Date().getHours();
  const part =
    hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 18 ? "afternoon" : "evening";
  return t(part, { name: user.firstName ?? user.name.split(" ")[0] });
}

/** Today, yesterday, the last week, the last month, then by month. */
function useGroupedChats(chats: Chat[]) {
  const t = useTranslations("Guidebooks.wikiChat.groups");
  const locale = useLocale();
  return useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = today.getTime();
    const month = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
    const pinned = chats.filter((chat) => chat.pinnedAt).sort((a, b) => b.pinnedAt! - a.pinnedAt!);
    const groups: { label: string; chats: Chat[] }[] = pinned.length
      ? [{ label: t("pinned"), chats: pinned }]
      : [];
    const rest = chats.filter((chat) => !chat.pinnedAt).sort((a, b) => b.updatedAt - a.updatedAt);
    for (const chat of rest) {
      const at = chat.updatedAt;
      const label =
        at >= start
          ? t("today")
          : at >= start - DAY_MS
            ? t("yesterday")
            : at >= start - 7 * DAY_MS
              ? t("week")
              : at >= start - 30 * DAY_MS
                ? t("month")
                : month.format(at);
      const last = groups.at(-1);
      if (last?.label === label) last.chats.push(chat);
      else groups.push({ label, chats: [chat] });
    }
    return groups;
  }, [chats, locale, t]);
}

function ChatList({
  chats,
  activeId,
  answering,
  renamingId,
  renameValue,
  onRenameValue,
  onCommitRename,
  onCancelRename,
  onOpen,
  onNew,
  onRename,
  onTogglePin,
  onDelete,
}: {
  chats: Chat[] | null;
  activeId: string | null;
  answering: Set<string>;
  renamingId: string | null;
  renameValue: string;
  onRenameValue: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (chat: Chat) => void;
  onTogglePin: (chat: Chat) => void;
  onDelete: (chat: Chat) => void;
}) {
  const t = useTranslations("Guidebooks.wikiChat");
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const visible = useMemo(
    () =>
      (chats ?? []).filter(
        (chat) =>
          !needle ||
          chat.title.toLowerCase().includes(needle) ||
          chat.messages.some((m) => m.content.toLowerCase().includes(needle)),
      ),
    [chats, needle],
  );
  const groups = useGroupedChats(visible);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-1 p-2">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          <SquarePen className="size-4" />
          {t("newChat")}
        </button>
        <label className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground focus-within:bg-muted">
          <Search className="size-4 shrink-0" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("searchChats")}
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {chats === null &&
          Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="mx-2.5 my-2.5 h-3.5 animate-pulse rounded bg-muted" />
          ))}
        {chats?.length === 0 && (
          <p className="px-2.5 py-4 text-xs text-muted-foreground">{t("emptyChats")}</p>
        )}
        {chats && chats.length > 0 && visible.length === 0 && (
          <p className="px-2.5 py-4 text-xs text-muted-foreground">{t("noMatches")}</p>
        )}
        {groups.map((group) => (
          <div key={group.label} className="mt-3 first:mt-1">
            <p className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">{group.label}</p>
            {group.chats.map((chat) => (
              <div
                key={chat.id}
                className={cn(
                  "group relative flex items-center rounded-lg text-sm transition-colors",
                  chat.id === activeId ? "bg-muted text-foreground" : "hover:bg-muted/60",
                )}
              >
                {renamingId === chat.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => onRenameValue(e.target.value)}
                    onBlur={onCommitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onCommitRename();
                      if (e.key === "Escape") onCancelRename();
                    }}
                    className="m-0.5 min-w-0 flex-1 rounded-md border border-ring/50 bg-background px-2 py-1 text-sm outline-none"
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onOpen(chat.id)}
                      title={chat.title}
                      className="min-w-0 flex-1 truncate px-2.5 py-1.5 text-left"
                    >
                      {chat.title}
                    </button>
                    {answering.has(chat.id) && (
                      <Loader2
                        aria-label={t("answering")}
                        className="mr-2 size-3.5 shrink-0 animate-spin text-muted-foreground group-hover:hidden"
                      />
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={t("moreOptions")}
                          className="mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-background hover:text-foreground data-[state=open]:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-40">
                        <DropdownMenuItem onSelect={() => onRename(chat)}>
                          <Pencil />
                          {t("rename")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onTogglePin(chat)}>
                          {chat.pinnedAt ? <PinOff /> : <Pin />}
                          {t(chat.pinnedAt ? "unpin" : "pin")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => onDelete(chat)}
                        >
                          <Trash2 />
                          {t("delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Composer({
  inputRef,
  value,
  onChange,
  onSubmit,
  onStop,
  working,
  sending,
  web,
  onWebChange,
  pending,
  onAddFiles,
  onRemoveFile,
  placeholder,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  working: boolean;
  sending: boolean;
  /** Null when the workspace has web search switched off. */
  web: boolean | null;
  onWebChange: (web: boolean) => void;
  pending: PendingFile[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  placeholder: string;
}) {
  const t = useTranslations("Guidebooks.wikiChat");
  const ta = useTranslations("Ai");
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const uploading = pending.some((file) => !file.token && !file.failed);
  const ready = pending.some((file) => file.token);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value, inputRef]);

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        onAddFiles(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        "relative rounded-2xl border bg-card shadow-sm transition-colors focus-within:border-ring/50",
        dragging ? "border-ring border-dashed" : "border-border",
      )}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-card/90 text-sm text-muted-foreground">
          {t("dropHere")}
        </div>
      )}
      {pending.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-2.5 pt-2.5">
          {pending.map((file) => (
            <AttachmentChip
              key={file.id}
              attachment={file}
              preview={file.preview}
              progress={file.token ? 1 : file.progress}
              failed={file.failed}
              onRemove={() => onRemoveFile(file.id)}
            />
          ))}
        </div>
      )}
      <textarea
        ref={inputRef}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSubmit();
          }
        }}
        onPaste={(e) => {
          if (!e.clipboardData.files.length) return;
          e.preventDefault();
          onAddFiles(Array.from(e.clipboardData.files));
        }}
        placeholder={placeholder}
        className="block max-h-60 min-h-[52px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center gap-1 px-2 pb-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            onAddFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label={t("attach")}
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Paperclip className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{t("attachHint")}</TooltipContent>
        </Tooltip>
        {web !== null && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onWebChange(!web)}
                aria-pressed={web}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                  web
                    ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Globe className="size-3.5" />
                {t("web")}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[16rem] text-balance leading-relaxed">
              {web ? t("webOnHint") : t("webOffHint")}
            </TooltipContent>
          </Tooltip>
        )}
        {working ? (
          <button
            type="button"
            onClick={onStop}
            aria-label={ta("stop")}
            className="ml-auto flex size-8 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-85"
          >
            <Square className="size-3 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={(!value.trim() && !ready) || uploading || sending}
            aria-label={t("send")}
            className="ml-auto flex size-8 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-85 disabled:opacity-25"
          >
            <ArrowUp className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The AI assistant, a chat in the Claude mould. Every question is saved before
 * it's answered and every answer is a run, so closing the tab mid-answer costs
 * nothing: come back (or follow the AI dock) and the answer is either still
 * arriving or there. The active chat lives in `?chat=`, which is also where
 * the dock points.
 */
export function WikiChat({ className }: { className?: string } = {}) {
  const t = useTranslations("Guidebooks");
  const ta = useTranslations("Ai");
  const tc = useTranslations("Common");
  const router = useRouter();
  const activeId = useSearchParams().get("chat");
  const apiClient = useIntranetApiClient();
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const keyboardInset = useKeyboardInset();
  const greeting = useGreeting();

  const [chats, setChats] = useState<Chat[] | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [web, setWeb] = useState(false);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const atBottomRef = useRef(true);

  useEffect(() => setWeb(readWebSetting()), []);

  function changeWeb(next: boolean) {
    setWeb(next);
    try {
      localStorage.setItem(WEB_KEY, next ? "1" : "0");
    } catch {
      // Private mode — it just won't be remembered.
    }
  }

  const loadChats = useCallback(async () => {
    try {
      const data = await apiClient.fetchJson<{ chats: Chat[] }>("/wiki-chat/chats");
      setChats(data.chats);
    } catch {
      setChats((prev) => prev ?? []);
    }
  }, [apiClient]);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  const webAvailable = useQuery(api.aiRuns.webSearchEnabled) ?? false;
  const dockRuns = useQuery(api.aiRuns.dock) ?? [];
  const answering = new Set(
    dockRuns
      .filter((r) => r.kind === "wikiChat" && r.status === "running")
      .map((r) => r.subjectKey.slice("wikiChat:".length)),
  );

  const view = useAiRun({ subjectKey: activeId ? `wikiChat:${activeId}` : null });
  const activeChat = chats?.find((c) => c.id === activeId) ?? null;
  const messages = activeChat?.messages ?? [];
  const awaitingAnswer = messages.at(-1)?.role === "user";
  const working = view.state === "working";

  // The run writes the answer into the chat before it reports done, so
  // reloading on "done" always picks the stored answer up.
  const runStatus = view.run?.status;
  const runId = view.run?._id;
  useEffect(() => {
    if (runStatus === "done") void loadChats();
  }, [runStatus, runId, loadChats]);

  useEffect(() => {
    if (view.state === "done" && !awaitingAnswer) view.markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.state, awaitingAnswer, runId]);

  const streamedChars = view.text?.length ?? 0;
  const stepCount = view.steps?.length ?? 0;
  useEffect(() => {
    if (atBottomRef.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, streamedChars, stepCount, view.state]);

  // A different chat starts at its newest message with the box ready.
  useEffect(() => {
    atBottomRef.current = true;
    setAtBottom(true);
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: "end" });
      inputRef.current?.focus();
    });
  }, [activeId]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottomRef.current = near;
    setAtBottom(near);
  }

  /** Starts uploading straight away, so the file is ready by the time the
   * question is typed. */
  function addFiles(files: File[]) {
    let room = MAX_FILES - pending.length;
    for (const file of files) {
      if (room <= 0) {
        toast.error(t("wikiChat.tooManyFiles", { count: MAX_FILES }));
        break;
      }
      if (!acceptable(file)) {
        toast.error(t("wikiChat.fileType", { name: file.name }));
        continue;
      }
      const image = file.type.startsWith("image/");
      if (file.size > (image ? MAX_IMAGE_BYTES : MAX_FILE_BYTES)) {
        toast.error(t("wikiChat.fileTooBig", { name: file.name }));
        continue;
      }
      room -= 1;
      const id = crypto.randomUUID();
      const update = (patch: Partial<PendingFile>) =>
        setPending((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      setPending((prev) => [
        ...prev,
        {
          id,
          name: file.name,
          mediaType: file.type || "text/plain",
          size: file.size,
          preview: image ? URL.createObjectURL(file) : undefined,
          progress: 0,
        },
      ]);
      const form = new FormData();
      form.append("file", file);
      apiClient
        .uploadForm<{ token: string; storageId: string }>("/wiki-chat/files", form, (progress) =>
          update({ progress }),
        )
        .then(({ token, storageId }) => update({ token, storageId, progress: 1 }))
        .catch(() => update({ failed: true }));
    }
  }

  function removeFile(id: string) {
    setPending((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return prev.filter((p) => p.id !== id);
    });
  }

  function jumpToLatest() {
    atBottomRef.current = true;
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }

  async function ask(
    question: string | null,
    { regenerate = false, editIndex }: { regenerate?: boolean; editIndex?: number } = {},
  ) {
    const withFiles = question !== null && editIndex === undefined;
    const files = withFiles ? pending.filter((file) => file.token) : [];
    if (sending || working) return;
    if (withFiles && pending.some((file) => !file.token && !file.failed)) return;
    if (question !== null && !question.trim() && files.length === 0) return;
    const text = question?.trim() ?? null;
    const fromInput = withFiles;
    const attachments: ChatAttachment[] = files.map(
      ({ name, mediaType, size, storageId, preview }) => {
        if (storageId && preview) rememberImage(storageId, preview);
        return { name, mediaType, size, storageId, preview };
      },
    );
    setSending(true);
    atBottomRef.current = true;
    if (activeId) {
      setChats(
        (prev) =>
          prev?.map((c) => {
            if (c.id !== activeId) return c;
            if (text !== null) {
              return {
                ...c,
                updatedAt: Date.now(),
                messages: [
                  ...(editIndex === undefined ? c.messages : c.messages.slice(0, editIndex)),
                  {
                    role: "user",
                    content: text,
                    attachments:
                      editIndex === undefined ? attachments : c.messages[editIndex]?.attachments,
                  },
                ],
              };
            }
            return regenerate && c.messages.at(-1)?.role === "assistant"
              ? { ...c, messages: c.messages.slice(0, -1) }
              : c;
          }) ?? prev,
      );
    }
    if (fromInput) setInput("");
    try {
      const res = await apiClient.fetchJson<{ chatId: string; title: string; runId: string }>(
        "/wiki-chat",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chatId: activeId ?? undefined,
            message: text || undefined,
            regenerate: regenerate || undefined,
            editIndex,
            attachments: files.length ? files.map((file) => file.token) : undefined,
            web: web && webAvailable,
          }),
        },
      );
      // The previews live on in the sent message, so they're not revoked.
      if (fromInput) setPending([]);
      if (!activeId && text !== null) {
        const now = Date.now();
        setChats((prev) => [
          {
            id: res.chatId,
            title: res.title,
            messages: [{ role: "user", content: text, attachments }],
            createdAt: now,
            updatedAt: now,
            pinnedAt: null,
          },
          ...(prev ?? []),
        ]);
        router.replace(`/wiki-chat?chat=${res.chatId}`, { scroll: false });
      }
    } catch (e) {
      // A conflict means the question was stored but the chat is still
      // answering the previous one — the text isn't lost, so don't hand it back.
      if (fromInput && !(e instanceof ApiResponseError && e.code === "conflict")) {
        setInput(text ?? "");
      }
      handleError(e);
      void loadChats();
    } finally {
      setSending(false);
    }
  }

  function openChat(id: string | null) {
    setListOpen(false);
    router.replace(id ? `/wiki-chat?chat=${id}` : "/wiki-chat", { scroll: false });
  }

  async function deleteChat(chat: Chat) {
    const ok = await confirm({
      title: t("wikiChat.deleteConfirm"),
      details: [{ label: tc("fieldTitle"), value: chat.title }],
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiClient.fetchJson(`/wiki-chat/chats/${chat.id}`, { method: "DELETE" });
      setChats((prev) => prev?.filter((c) => c.id !== chat.id) ?? prev);
      if (chat.id === activeId) openChat(null);
    } catch (e) {
      handleError(e);
    }
  }

  async function togglePin(chat: Chat) {
    const pinned = !chat.pinnedAt;
    setChats(
      (prev) =>
        prev?.map((c) => (c.id === chat.id ? { ...c, pinnedAt: pinned ? Date.now() : null } : c)) ??
        prev,
    );
    try {
      await apiClient.fetchJson(`/wiki-chat/chats/${chat.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
    } catch (e) {
      handleError(e);
      void loadChats();
    }
  }

  function startRename(chat: Chat) {
    setRenamingId(chat.id);
    setRenameValue(chat.title);
  }

  async function commitRename() {
    const id = renamingId;
    const title = renameValue.replace(/\s+/g, " ").trim();
    setRenamingId(null);
    if (!id || !title || title === chats?.find((c) => c.id === id)?.title) return;
    setChats((prev) => prev?.map((c) => (c.id === id ? { ...c, title } : c)) ?? prev);
    try {
      await apiClient.fetchJson(`/wiki-chat/chats/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
    } catch (e) {
      handleError(e);
      void loadChats();
    }
  }

  const starters = t.raw("wikiChat.starters") as string[];
  const failed =
    awaitingAnswer &&
    !sending &&
    (view.state === "error" || view.state === "interrupted" || view.state === "cancelled");
  const lastAnswerIndex = messages.findLastIndex((m) => m.role === "assistant");

  const list = (
    <ChatList
      chats={chats}
      activeId={activeId}
      answering={answering}
      renamingId={renamingId}
      renameValue={renameValue}
      onRenameValue={setRenameValue}
      onCommitRename={() => void commitRename()}
      onCancelRename={() => setRenamingId(null)}
      onOpen={openChat}
      onNew={() => openChat(null)}
      onRename={startRename}
      onTogglePin={(chat) => void togglePin(chat)}
      onDelete={(chat) => void deleteChat(chat)}
    />
  );

  const composer = (
    <Composer
      inputRef={inputRef}
      value={input}
      onChange={setInput}
      onSubmit={() => void ask(input)}
      onStop={view.cancel}
      working={working}
      sending={sending}
      web={webAvailable ? web : null}
      onWebChange={changeWeb}
      pending={pending}
      onAddFiles={addFiles}
      onRemoveFile={removeFile}
      placeholder={activeId ? t("wikiChat.replyPlaceholder") : t("wikiChat.placeholder")}
    />
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex h-full min-h-0 overflow-hidden bg-background", className)}>
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border/70 bg-muted/20 md:flex">
          {list}
        </aside>
        <MobileDrawer open={listOpen} onOpenChange={setListOpen} ariaLabel={t("wikiChat.chats")}>
          {list}
        </MobileDrawer>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-1 px-2 sm:px-3">
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              onClick={() => setListOpen(true)}
              aria-label={t("wikiChat.chats")}
            >
              <PanelLeft />
            </Button>
            {activeChat &&
              (renamingId === activeChat.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => void commitRename()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void commitRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="min-w-0 max-w-md flex-1 rounded-md border border-ring/50 bg-background px-2 py-1 text-sm outline-none"
                />
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium transition-colors hover:bg-muted"
                    >
                      <span className="truncate">{activeChat.title}</span>
                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-40">
                    <DropdownMenuItem onSelect={() => startRename(activeChat)}>
                      <Pencil />
                      {t("wikiChat.rename")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void togglePin(activeChat)}>
                      {activeChat.pinnedAt ? <PinOff /> : <Pin />}
                      {t(activeChat.pinnedAt ? "wikiChat.unpin" : "wikiChat.pin")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => void deleteChat(activeChat)}
                    >
                      <Trash2 />
                      {t("wikiChat.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ))}
            {activeId && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto md:hidden"
                onClick={() => openChat(null)}
                aria-label={t("wikiChat.newChat")}
              >
                <SquarePen />
              </Button>
            )}
          </header>

          {!activeId ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-[10vh]">
              <div className="w-full max-w-2xl">
                <h1 className="mb-7 flex items-center justify-center gap-3 text-center font-display text-3xl tracking-tight sm:text-[2.5rem]">
                  <Mark provider="claude" className="size-7 shrink-0 sm:size-9" />
                  <span className="min-w-0">{greeting}</span>
                </h1>
                {composer}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {starters.map((starter, index) => (
                    <button
                      key={starter}
                      type="button"
                      onClick={() => void ask(starter)}
                      disabled={sending}
                      className="ai-rise rounded-full border border-border/70 px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                      style={{ ["--i" as string]: index }}
                    >
                      {starter}
                    </button>
                  ))}
                </div>
                <p className="mt-6 text-center text-xs text-muted-foreground">
                  {t("wikiChat.emptyPrompt")}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="relative min-h-0 flex-1">
                <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
                  <div className="mx-auto w-full max-w-3xl space-y-8 px-4 pb-10 pt-4 sm:px-6">
                    {messages.map((m, i) =>
                      m.role === "user" ? (
                        <UserMessage
                          key={i}
                          chatId={activeId}
                          content={m.content}
                          attachments={m.attachments}
                          onEdit={
                            working || sending
                              ? undefined
                              : (text) => void ask(text, { editIndex: i })
                          }
                        />
                      ) : (
                        <AssistantMessage
                          key={i}
                          message={m}
                          latest={i === lastAnswerIndex && !awaitingAnswer}
                          run={i === lastAnswerIndex && view.run?._id === m.runId ? view.run : null}
                          onRegenerate={
                            i === messages.length - 1 && !working && !sending
                              ? () => void ask(null, { regenerate: true })
                              : undefined
                          }
                        />
                      ),
                    )}

                    {awaitingAnswer && (working || sending || view.state === "done") && (
                      <AssistantMessage
                        working={working || sending}
                        message={{
                          role: "assistant",
                          content: view.state === "error" ? "" : (view.text ?? ""),
                          steps: (view.steps as ChatStep[] | null) ?? [],
                        }}
                        phase={view.run?.phase}
                        elapsedSec={view.elapsedSec}
                      />
                    )}

                    {failed && (
                      <div className="ai-rise flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/70 bg-card px-3.5 py-2.5">
                        <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                          {view.state === "error"
                            ? ta(aiErrorKey(view.run?.errorCode ?? null))
                            : view.state === "cancelled"
                              ? ta("cancelledBody")
                              : ta("interruptedBody")}
                        </span>
                        <Button size="xs" variant="outline" onClick={() => void ask(null)}>
                          <RotateCcw />
                          {ta("retry")}
                        </Button>
                      </div>
                    )}
                    <div ref={bottomRef} />
                  </div>
                </div>
                {!atBottom && (
                  <button
                    type="button"
                    onClick={jumpToLatest}
                    aria-label={t("wikiChat.jumpToLatest")}
                    className="ai-rise absolute bottom-3 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md transition-colors hover:text-foreground"
                  >
                    <ArrowDown className="size-4" />
                  </button>
                )}
              </div>

              <div
                className="px-3 sm:px-4"
                style={{
                  // Layout viewport doesn't shrink for the keyboard, so this
                  // needs lifting by however much it covers.
                  marginBottom: keyboardInset,
                  paddingBottom: keyboardInset
                    ? "0.5rem"
                    : "calc(env(safe-area-inset-bottom) + 0.5rem)",
                }}
              >
                <div className="mx-auto max-w-3xl">
                  {composer}
                  <p className="mt-1.5 px-1 text-center text-[11px] text-muted-foreground">
                    {working ? ta("keepsRunning") : t("wikiChat.disclaimer")}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
