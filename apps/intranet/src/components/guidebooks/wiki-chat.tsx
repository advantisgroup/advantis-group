"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@clerk/nextjs";
import { Pencil, Plus, Send, ShieldCheck, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const API =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ??
  "https://api.advantisgroup.de";

interface Message {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

interface Chat {
  id: string; // local id (used for keying/UI)
  remoteId?: string; // server id once persisted
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

// Funny little status quips — fuel & card themed, à la Claude Code. Kept in
// code (not the catalogs) because they're arrays picked at random; both
// languages live here and the locale chooses the set.
const LOADING_QUOTES_DE = [
  "Wird betankt…",
  "Karte wird aufgeladen…",
  "Tank wird gefüllt…",
  "Mautbox wird kalibriert…",
  "AdBlue wird nachgefüllt…",
  "Zapfsäule wird angeschlossen…",
  "Kraftstoff fließt…",
  "Route wird berechnet…",
  "Ladesäule sucht Strom…",
  "Reichweite wird ermittelt…",
  "Diesel wird gezapft…",
  "Beleg wird gebucht…",
  "Stationen werden gescannt…",
  "Volltanken…",
  "Quittung wird gedruckt…",
];

const LOADING_QUOTES_EN = [
  "Refuelling…",
  "Topping up the card…",
  "Filling the tank…",
  "Calibrating the toll box…",
  "Refilling the AdBlue…",
  "Connecting the pump…",
  "Fuel is flowing…",
  "Calculating the route…",
  "Charging station hunting for power…",
  "Estimating the range…",
  "Pumping diesel…",
  "Booking the receipt…",
  "Scanning stations…",
  "Filling her up…",
  "Printing the receipt…",
];

// Short, slightly cheeky error lines (rendered in red).
const ERROR_QUOTES_DE = [
  "Tank leergelaufen – bitte erneut versuchen.",
  "Verbindung abgerissen, die Leitung ist trocken. Nochmal?",
  "Da hat die Karte nicht durchgezogen. Bitte erneut senden.",
  "Zapfsäule streikt gerade. Versuch es gleich nochmal.",
];

const ERROR_QUOTES_EN = [
  "Ran out of fuel – please try again.",
  "Connection dropped, the line is dry. One more time?",
  "The card didn't go through. Please send again.",
  "The pump is on strike. Try again in a moment.",
];

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function deriveTitle(text: string, fallback: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean || fallback;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeChat(title: string): Chat {
  const now = Date.now();
  return {
    id: uid(),
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function WikiChat() {
  const t = useTranslations("Guidebooks");
  const locale = useLocale();
  const loadingQuotes = locale === "de" ? LOADING_QUOTES_DE : LOADING_QUOTES_EN;
  const errorQuotes = locale === "de" ? ERROR_QUOTES_DE : ERROR_QUOTES_EN;
  const { getToken } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(loadingQuotes[0]);
  const [elapsed, setElapsed] = useState(0);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Cross-origin requests to the API can't rely on the Clerk cookie, so send
  // the session token as a Bearer header (matches ConversationView).
  async function authHeaders(
    extra?: Record<string, string>
  ): Promise<Record<string, string>> {
    const token = await getToken();
    return {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  }

  // --- Load encrypted history from the API --------------------------------
  useEffect(() => {
    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/wiki-chat/chats`, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = (await res.json()) as { chats?: Omit<Chat, "remoteId">[] };
        const loaded: Chat[] = (data.chats ?? []).map(c => ({
          ...c,
          remoteId: c.id,
        }));
        if (loaded.length > 0) {
          setChats(loaded);
          setActiveId(loaded[0].id);
        }
      } catch {
        // Offline / unauthenticated — start with an empty workspace.
      }
    })();
  }, [getToken]);

  const activeChat = useMemo(
    () => chats.find(c => c.id === activeId) ?? null,
    [chats, activeId]
  );
  const messages = useMemo(() => activeChat?.messages ?? [], [activeChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // --- Cycle loading quotes + elapsed timer -------------------------------
  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return;
    }
    setQuote(pick(loadingQuotes));
    const start = Date.now();
    const quoteTimer = setInterval(() => setQuote(pick(loadingQuotes)), 1800);
    const tick = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      250
    );
    return () => {
      clearInterval(quoteTimer);
      clearInterval(tick);
    };
  }, [loading]);

  function newChat() {
    const empty = chats.find(c => c.messages.length === 0);
    if (empty) {
      setActiveId(empty.id);
      return;
    }
    const chat = makeChat(t("wikiChat.newChat"));
    setChats(prev => [chat, ...prev]);
    setActiveId(chat.id);
  }

  function deleteChat(id: string) {
    const chat = chats.find(c => c.id === id);
    if (chat?.remoteId) {
      void authHeaders().then(headers =>
        fetch(`${API}/wiki-chat/chats/${chat.remoteId}`, {
          method: "DELETE",
          headers,
        }).catch(() => {})
      );
    }
    setChats(prev => {
      const next = prev.filter(c => c.id !== id);
      if (id === activeId) setActiveId(next[0]?.id ?? null);
      return next;
    });
  }

  function startRename(chat: Chat) {
    setRenamingId(chat.id);
    setRenameValue(chat.title);
  }

  function commitRename() {
    const id = renamingId;
    const title = renameValue.replace(/\s+/g, " ").trim();
    if (id && title) {
      setChats(prev => prev.map(c => (c.id === id ? { ...c, title } : c)));
      const chat = chats.find(c => c.id === id);
      if (chat?.remoteId) {
        void authHeaders({ "Content-Type": "application/json" }).then(headers =>
          fetch(`${API}/wiki-chat/chats/${chat.remoteId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ title }),
          }).catch(() => {})
        );
      }
    }
    setRenamingId(null);
    setRenameValue("");
  }

  async function persist(
    chatId: string,
    remoteId: string | undefined,
    title: string,
    msgs: Message[]
  ) {
    try {
      if (remoteId) {
        await fetch(`${API}/wiki-chat/chats/${remoteId}`, {
          method: "PATCH",
          headers: await authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ title, messages: msgs }),
        });
      } else {
        const res = await fetch(`${API}/wiki-chat/chats`, {
          method: "POST",
          headers: await authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ title, messages: msgs }),
        });
        if (res.ok) {
          const { id } = (await res.json()) as { id: string };
          setChats(prev =>
            prev.map(c => (c.id === chatId ? { ...c, remoteId: id } : c))
          );
        }
      }
    } catch {
      // Persistence failed — the chat still lives in the current session.
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    // Ensure an active chat exists.
    let chatId = activeId;
    let base = chats;
    if (!chatId || !chats.some(c => c.id === chatId)) {
      const chat = makeChat(t("wikiChat.newChat"));
      base = [chat, ...chats];
      chatId = chat.id;
      setActiveId(chatId);
    }
    const current = base.find(c => c.id === chatId)!;
    const remoteId = current.remoteId;
    const isFirst = current.messages.length === 0;
    const withUser: Message[] = [
      ...current.messages,
      { role: "user", content: text },
    ];
    const title = isFirst
      ? deriveTitle(text, t("wikiChat.newChat"))
      : current.title;

    setChats(
      base.map(c =>
        c.id === chatId
          ? {
              ...c,
              title,
              messages: [...withUser, { role: "assistant", content: "" }],
              updatedAt: Date.now(),
            }
          : c
      )
    );
    setLoading(true);

    const writeAssistant = (content: string, error = false) =>
      setChats(prev =>
        prev.map(c =>
          c.id === chatId
            ? {
                ...c,
                messages: [...withUser, { role: "assistant", content, error }],
                updatedAt: Date.now(),
              }
            : c
        )
      );

    let finalMessages: Message[] = withUser;
    try {
      const res = await fetch(`${API}/wiki-chat`, {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ messages: withUser }),
      });
      if (!res.ok || !res.body) throw new Error("Anfrage fehlgeschlagen");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        writeAssistant(accumulated);
      }
      if (!accumulated.trim()) {
        const q = pick(errorQuotes);
        writeAssistant(q, true);
        finalMessages = [
          ...withUser,
          { role: "assistant", content: q, error: true },
        ];
      } else {
        finalMessages = [
          ...withUser,
          { role: "assistant", content: accumulated },
        ];
      }
    } catch {
      const q = pick(errorQuotes);
      writeAssistant(q, true);
      finalMessages = [
        ...withUser,
        { role: "assistant", content: q, error: true },
      ];
    } finally {
      setLoading(false);
    }

    void persist(chatId, remoteId, title, finalMessages);
  }

  const showQuote = loading && messages[messages.length - 1]?.content === "";

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full min-h-0 overflow-hidden rounded-xl border border-border bg-background">
        {/* Sidebar — chat history */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-muted/30 sm:flex">
          <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("wikiChat.chats")}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={t("wikiChat.privacyAria")}
                >
                  <ShieldCheck className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="max-w-[15rem] text-balance leading-relaxed"
              >
                {t("wikiChat.privacyHint")}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="px-2.5 pb-2.5">
            <button
              onClick={newChat}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
              {t("wikiChat.newChat")}
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
            {chats.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                {t("wikiChat.emptyChats")}
              </p>
            )}
            {chats.map(chat => (
              <div
                key={chat.id}
                className={cn(
                  "group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors",
                  chat.id === activeId
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                )}
              >
                {renamingId === chat.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="min-w-0 flex-1 rounded border border-primary/40 bg-background px-1.5 py-0.5 text-sm outline-none"
                  />
                ) : (
                  <>
                    <button
                      onClick={() => setActiveId(chat.id)}
                      className="min-w-0 flex-1 truncate text-left"
                      title={chat.title}
                    >
                      {chat.title}
                    </button>
                    <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => startRename(chat)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={t("wikiChat.rename")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteChat(chat.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={t("wikiChat.delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* Main chat column */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Mobile-only header with new-chat shortcut */}
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 sm:hidden">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {activeChat?.title ?? t("wikiChat.title")}
            </span>
            <button
              onClick={newChat}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("wikiChat.newShort")}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {messages.length === 0 && !loading && (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <div className="text-4xl">💬</div>
                <p className="whitespace-pre-line text-sm font-medium">
                  {t("wikiChat.emptyPrompt")}
                </p>
              </div>
            )}
            <div className="space-y-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex",
                    m.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      m.role === "user"
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : m.error
                          ? "rounded-bl-sm border border-destructive/30 bg-destructive/5 text-destructive"
                          : "rounded-bl-sm border border-border bg-background text-foreground"
                    )}
                  >
                    {m.role === "assistant" && !m.error ? (
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => (
                            <p className="mb-1 last:mb-0">{children}</p>
                          ),
                          ul: ({ children }) => (
                            <ul className="mb-1 ml-4 list-disc space-y-0.5">
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="mb-1 ml-4 list-decimal space-y-0.5">
                              {children}
                            </ol>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold">
                              {children}
                            </strong>
                          ),
                          code: ({ children }) => (
                            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                              {children}
                            </code>
                          ),
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    ) : (
                      m.content
                    )}
                  </div>
                </div>
              ))}
              {showQuote && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-border bg-background px-4 py-2.5">
                    <span className="flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:300ms]" />
                    </span>
                    <span className="animate-pulse text-sm italic text-muted-foreground">
                      {quote}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground/60">
                      {elapsed}s
                    </span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Composer */}
          <div className="flex gap-2 border-t border-border p-3">
            <textarea
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={t("wikiChat.placeholder")}
              className="flex-1 resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
            />
            <Button
              size="icon"
              onClick={send}
              disabled={!input.trim() || loading}
              className="h-10 w-10 shrink-0 rounded-xl"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
