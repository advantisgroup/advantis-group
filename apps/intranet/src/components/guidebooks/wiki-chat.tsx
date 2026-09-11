"use client";

import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { ArrowUp, Pencil, Plus, RotateCcw, ShieldCheck, Square, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";

import { AiGlyph } from "@/components/ai/AiGlyph";
import { aiErrorKey } from "@/components/ai/AiRunCard";
import { AiReveal } from "@/components/ai/AiReveal";
import { AiThinking } from "@/components/ai/AiThinking";
import { useAiRun } from "@/components/ai/use-ai-run";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { ApiResponseError, useIntranetApiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

const MARKDOWN: ComponentProps<typeof ReactMarkdown>["components"] = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-0.5">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
  ),
  h1: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
  h2: ({ children }) => <p className="mb-1 mt-3 font-semibold first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="mb-1 mt-3 font-semibold first:mt-0">{children}</p>,
  hr: () => <hr className="my-3 border-border/60" />,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2"
    >
      {children}
    </a>
  ),
};

function AssistantRow({ working = false, children }: { working?: boolean; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="ai-edge mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full [--ai-ground:var(--background)]">
        <AiGlyph working={working} className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 pt-1 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

/**
 * The wiki assistant. Every question is saved before it's answered and every
 * answer is a run, so closing the tab mid-answer costs nothing: come back
 * (or follow the AI dock) and the answer is either still arriving or there.
 * The active chat lives in `?chat=`, which is also where the dock points.
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

  const [chats, setChats] = useState<Chat[] | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const atBottomRef = useRef(true);

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

  const dockRuns = useQuery(api.aiRuns.dock) ?? [];
  const answeringChats = new Set(
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
  useEffect(() => {
    if (atBottomRef.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, streamedChars, view.state]);

  function onScroll() {
    const el = scrollRef.current;
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  function resizeInput() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  async function ask(question: string | null) {
    if (sending || working || (question !== null && !question.trim())) return;
    const text = question?.trim() ?? null;
    setSending(true);
    atBottomRef.current = true;
    if (text !== null) {
      setInput("");
      requestAnimationFrame(resizeInput);
      if (activeId) {
        setChats(
          (prev) =>
            prev?.map((c) =>
              c.id === activeId
                ? { ...c, messages: [...c.messages, { role: "user", content: text }] }
                : c,
            ) ?? prev,
        );
      }
    }
    try {
      const res = await apiClient.fetchJson<{ chatId: string; title: string; runId: string }>(
        "/wiki-chat",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chatId: activeId ?? undefined, message: text ?? undefined }),
        },
      );
      if (!activeId && text !== null) {
        const now = Date.now();
        setChats((prev) => [
          {
            id: res.chatId,
            title: res.title,
            messages: [{ role: "user", content: text }],
            createdAt: now,
            updatedAt: now,
          },
          ...(prev ?? []),
        ]);
        router.replace(`/wiki-chat?chat=${res.chatId}`, { scroll: false });
      }
    } catch (e) {
      // A conflict means the question was stored but the chat is still
      // answering the previous one — the text isn't lost, so don't hand it back.
      if (text !== null && !(e instanceof ApiResponseError && e.code === "conflict")) {
        setInput(text);
      }
      handleError(e);
      void loadChats();
    } finally {
      setSending(false);
    }
  }

  function openChat(id: string | null) {
    router.replace(id ? `/wiki-chat?chat=${id}` : "/wiki-chat", { scroll: false });
    requestAnimationFrame(() => inputRef.current?.focus());
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

  async function commitRename() {
    const id = renamingId;
    const title = renameValue.replace(/\s+/g, " ").trim();
    setRenamingId(null);
    if (!id || !title) return;
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

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          "flex h-full min-h-0 overflow-hidden rounded-xl border border-border bg-background",
          className,
        )}
      >
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-muted/30 sm:flex">
          <div className="flex items-center justify-between gap-2 px-3 pb-1.5 pt-3">
            <span className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-muted-foreground refreshed:text-xs refreshed:normal-case refreshed:tracking-normal">
              {t("wikiChat.chats")}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={t("wikiChat.privacyAria")}
                >
                  <ShieldCheck className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[15rem] text-balance leading-relaxed">
                {t("wikiChat.privacyHint")}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="px-2.5 pb-2.5">
            <button
              type="button"
              onClick={() => openChat(null)}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Plus className="size-4" />
              {t("wikiChat.newChat")}
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
            {chats?.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                {t("wikiChat.emptyChats")}
              </p>
            )}
            {chats?.map((chat) => (
              <div
                key={chat.id}
                className={cn(
                  "group flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                  chat.id === activeId
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                )}
              >
                {renamingId === chat.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => void commitRename()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="min-w-0 flex-1 rounded border border-primary/40 bg-background px-1.5 py-0.5 text-sm outline-none"
                  />
                ) : (
                  <>
                    {answeringChats.has(chat.id) && <AiGlyph working className="size-3.5" />}
                    <button
                      type="button"
                      onClick={() => openChat(chat.id)}
                      className="min-w-0 flex-1 truncate text-left"
                      title={chat.title}
                    >
                      {chat.title}
                    </button>
                    <span className="flex shrink-0 items-center transition-opacity md:opacity-0 md:group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(chat.id);
                          setRenameValue(chat.title);
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={t("wikiChat.rename")}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteChat(chat)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={t("wikiChat.delete")}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 sm:hidden">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {activeChat?.title ?? t("wikiChat.title")}
            </span>
            <button
              type="button"
              onClick={() => openChat(null)}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <Plus className="size-3.5" />
              {t("wikiChat.newShort")}
            </button>
          </div>

          <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
            {!activeId ? (
              <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center gap-5 px-6 py-10 text-center">
                <span className="ai-edge flex size-14 items-center justify-center rounded-2xl [--ai-ground:var(--background)]">
                  <AiGlyph className="size-7" />
                </span>
                <div>
                  <h2 className="font-display text-2xl font-bold tracking-tight refreshed:text-xl refreshed:font-semibold">
                    {t("wikiChat.emptyTitle")}
                  </h2>
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                    {t("wikiChat.emptyPrompt")}
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2">
                  {starters.map((starter, index) => (
                    <button
                      key={starter}
                      type="button"
                      onClick={() => void ask(starter)}
                      disabled={sending}
                      className="ai-rise rounded-xl border border-border/70 bg-card px-4 py-2.5 text-left text-sm transition-colors hover:border-border hover:bg-muted/50 disabled:opacity-50"
                      style={{ ["--i" as string]: index }}
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-foreground/[0.07] px-4 py-2.5 text-sm leading-relaxed">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <AssistantRow key={i}>
                      <ReactMarkdown components={MARKDOWN}>{m.content}</ReactMarkdown>
                    </AssistantRow>
                  ),
                )}

                {awaitingAnswer && (working || sending || view.state === "done") && (
                  <AssistantRow working={working || sending}>
                    {view.text && view.state !== "error" ? (
                      <AiReveal text={view.text} />
                    ) : (
                      <AiThinking phase={view.run?.phase} elapsedSec={view.elapsedSec} />
                    )}
                  </AssistantRow>
                )}

                {failed && (
                  <AssistantRow>
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
                  </AssistantRow>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div
            className="border-t border-border/70 px-3 pt-3 sm:px-4"
            style={{
              // Layout viewport doesn't shrink for the keyboard, so this
              // needs lifting by however much it covers.
              marginBottom: keyboardInset,
              paddingBottom: keyboardInset
                ? "0.75rem"
                : "calc(env(safe-area-inset-bottom) + 0.75rem)",
            }}
          >
            <div
              data-working={working}
              className="ai-orbit mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-card p-1.5 pl-3.5 focus-within:border-ring/60"
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  resizeInput();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(input);
                  }
                }}
                placeholder={t("wikiChat.placeholder")}
                className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              {working ? (
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={view.cancel}
                  aria-label={ta("stop")}
                  className="shrink-0 rounded-xl"
                >
                  <Square className="fill-current" />
                </Button>
              ) : (
                <Button
                  size="icon-sm"
                  onClick={() => void ask(input)}
                  disabled={!input.trim() || sending}
                  aria-label={t("wikiChat.send")}
                  className="shrink-0 rounded-xl"
                >
                  <ArrowUp />
                </Button>
              )}
            </div>
            {working && (
              <p className="mx-auto mt-1.5 max-w-3xl px-1 text-center text-[11px] text-muted-foreground">
                {ta("keepsRunning")}
              </p>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
