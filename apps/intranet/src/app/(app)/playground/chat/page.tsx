"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import type { api } from "@advantis/convex/api";
import { type FunctionReturnType } from "convex/server";
import { Check, CheckCheck, RotateCcw, SendHorizontal, Smartphone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { ChatDayDivider, chatBubbleClass } from "@/components/chat/chat-surface";
import { MessageAttachments } from "@/components/chat/MessageAttachments";
import { Demo } from "@/components/playground/Demo";
import { PhoneFrame } from "@/components/playground/PhoneFrame";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TogglePill } from "@/components/ui/filter-pill";
import { Input } from "@/components/ui/input";
import { ReactionChips, ReactionPicker, type Reaction } from "@/components/ui/reactions";
import { formatTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type Attachment = FunctionReturnType<
  typeof api.chat.getMessages
>["page"][number]["attachments"][number];

interface FakeMessage {
  id: number;
  sender: "me" | "anna" | "ben";
  body: string;
  createdAt: number;
  attachments: Attachment[];
  linkPreviews: { url: string; title?: string; description?: string; image?: string }[];
  reactions: Reaction[];
  replyTo?: number;
  edited?: boolean;
  deleted?: boolean;
  seen?: boolean;
}

const NAMES = { me: "", anna: "Anna Berg", ben: "Ben Okafor" } as const;
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const MIN = 60_000;

function svgDataUrl(from: string, to: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="480" height="300" fill="url(#g)"/><circle cx="360" cy="90" r="42" fill="#fff" opacity=".55"/><path d="M0 300 L150 170 L250 250 L340 190 L480 300Z" fill="#000" opacity=".18"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function attachment(partial: Partial<Attachment> & Pick<Attachment, "kind" | "name">): Attachment {
  return {
    storageId: `playground-${partial.name}` as Attachment["storageId"],
    url: null,
    ...partial,
  } as Attachment;
}

function seed(t: (key: string) => string): FakeMessage[] {
  const now = Date.now();
  return [
    {
      id: 1,
      sender: "anna",
      body: t("chat.seed.morning"),
      createdAt: now - 26 * 60 * MIN,
      attachments: [],
      linkPreviews: [],
      reactions: [{ emoji: "👍", count: 2, mine: true }],
    },
    {
      id: 2,
      sender: "ben",
      body: t("chat.seed.photo"),
      createdAt: now - 25 * 60 * MIN,
      attachments: [
        attachment({
          kind: "image",
          name: "team-offsite.svg",
          url: svgDataUrl("#f97316", "#8b5cf6"),
          contentType: "image/svg+xml",
          width: 480,
          height: 300,
        }),
      ],
      linkPreviews: [],
      reactions: [
        { emoji: "🎉", count: 3, mine: false },
        { emoji: "❤️", count: 1, mine: true },
      ],
    },
    {
      id: 3,
      sender: "ben",
      body: "",
      createdAt: now - 25 * 60 * MIN + 30_000,
      attachments: [],
      linkPreviews: [],
      reactions: [],
      deleted: true,
    },
    {
      id: 4,
      sender: "me",
      body: t("chat.seed.agenda"),
      createdAt: now - 40 * MIN,
      attachments: [
        attachment({
          kind: "file",
          name: "Agenda.txt",
          url: `data:text/plain;charset=utf-8,${encodeURIComponent(t("chat.seed.agendaFile"))}`,
          contentType: "text/plain",
          size: 120,
        }),
        attachment({
          kind: "file",
          name: "Budget 2026.xlsx",
          url: "#",
          oneDrivePath: "/Team/Finance/Budget 2026.xlsx",
        }),
      ],
      linkPreviews: [],
      reactions: [],
      edited: true,
      seen: true,
    },
    {
      id: 5,
      sender: "anna",
      body: t("chat.seed.link"),
      createdAt: now - 12 * MIN,
      replyTo: 4,
      attachments: [],
      linkPreviews: [
        {
          url: "https://www.anthropic.com",
          title: "Anthropic",
          description: t("chat.seed.linkDescription"),
        },
      ],
      reactions: [],
    },
  ];
}

const REPLIES = ["chat.replies.one", "chat.replies.two", "chat.replies.three", "chat.replies.four"];

function toggleReaction(reactions: Reaction[], emoji: string): Reaction[] {
  const existing = reactions.find((r) => r.emoji === emoji);
  if (!existing) return [...reactions, { emoji, count: 1, mine: true }];
  if (!existing.mine) {
    return reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r));
  }
  return reactions
    .map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r))
    .filter((r) => r.count > 0);
}

function ChatLab() {
  const t = useTranslations("Playground");
  const locale = useLocale();
  const [messages, setMessages] = useState(() => seed(t));
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState<"anna" | "ben" | null>(null);
  const [phone, setPhone] = useState(false);
  const replyCount = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pending = useRef<number[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length, typing]);

  useEffect(() => () => pending.current.forEach((id) => window.clearTimeout(id)), []);

  function send(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        sender: "me",
        body,
        createdAt: Date.now(),
        attachments: [],
        linkPreviews: [],
        reactions: [],
      },
    ]);
    const who = replyCount.current % 2 === 0 ? "anna" : "ben";
    const reply = t(REPLIES[replyCount.current % REPLIES.length]);
    replyCount.current += 1;
    pending.current.push(
      window.setTimeout(() => {
        setMessages((current) =>
          current.map((m) => (m.sender === "me" ? { ...m, seen: true } : m)),
        );
        setTyping(who);
      }, 700),
      window.setTimeout(() => {
        setTyping(null);
        setMessages((current) => [
          ...current,
          {
            id: Date.now(),
            sender: who,
            body: reply,
            createdAt: Date.now(),
            attachments: [],
            linkPreviews: [],
            reactions: [],
          },
        ]);
      }, 2200),
    );
  }

  function react(id: number, emoji: string) {
    setMessages((current) =>
      current.map((m) =>
        m.id === id ? { ...m, reactions: toggleReaction(m.reactions, emoji) } : m,
      ),
    );
  }

  function reset() {
    pending.current.forEach((id) => window.clearTimeout(id));
    pending.current = [];
    setTyping(null);
    setMessages(seed(t));
  }

  const dayLabel = (ts: number) =>
    new Date(ts).toDateString() === new Date().toDateString()
      ? t("chat.today")
      : t("chat.yesterday");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <TogglePill active={phone} onClick={() => setPhone((p) => !p)}>
          <Smartphone className="size-3.5" />
          {t("chat.phone")}
        </TogglePill>
        <Button variant="ghost" size="xs" onClick={reset}>
          <RotateCcw />
          {t("reset")}
        </Button>
      </div>

      <PhoneFrame on={phone} label="375px" className="bg-card">
        <div className="flex h-[30rem] flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {messages.map((m, i) => {
                const mine = m.sender === "me";
                const prev = messages[i - 1];
                const sameDay =
                  !!prev &&
                  new Date(prev.createdAt).toDateString() === new Date(m.createdAt).toDateString();
                const grouped =
                  !!prev &&
                  sameDay &&
                  prev.sender === m.sender &&
                  !prev.deleted &&
                  m.createdAt - prev.createdAt < GROUP_WINDOW_MS;
                const quoted = m.replyTo ? messages.find((x) => x.id === m.replyTo) : undefined;
                return (
                  <div key={m.id}>
                    {!sameDay && <ChatDayDivider label={dayLabel(m.createdAt)} />}
                    <div
                      className={cn(
                        "group flex gap-2",
                        mine && "flex-row-reverse",
                        grouped ? "mt-0.5" : "mt-3",
                      )}
                    >
                      {!mine &&
                        (grouped ? (
                          <span className="w-7 shrink-0" />
                        ) : (
                          <Avatar className="mt-auto h-7 w-7 shrink-0">
                            <AvatarFallback className="text-[10px]">
                              {initials(NAMES[m.sender])}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                      <div
                        className={cn(
                          "flex min-w-0 max-w-[78%] flex-col gap-1",
                          mine ? "items-end" : "items-start",
                        )}
                      >
                        <div className={cn("flex items-center gap-1", mine && "flex-row-reverse")}>
                          <div className={chatBubbleClass(mine)}>
                            {!mine && !grouped && (
                              <p className="mb-0.5 text-xs font-semibold text-blue-500 refreshed:text-muted-foreground">
                                {NAMES[m.sender]}
                              </p>
                            )}
                            {quoted && (
                              <div className="mb-1 flex flex-col rounded-md border-l-2 border-blue-500/60 bg-background/60 px-2 py-1 text-xs refreshed:border-foreground/25">
                                <span className="font-semibold opacity-80">
                                  {quoted.sender === "me" ? t("chat.you") : NAMES[quoted.sender]}
                                </span>
                                <span className="truncate opacity-70">{quoted.body}</span>
                              </div>
                            )}
                            {m.deleted ? (
                              <p className="italic opacity-70">{t("chat.deleted")}</p>
                            ) : (
                              <>
                                {m.body && (
                                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                                )}
                                <MessageAttachments message={m} />
                              </>
                            )}
                            <div
                              className={cn(
                                "mt-0.5 flex items-center gap-1 text-[10px] opacity-60",
                                mine && "justify-end",
                              )}
                            >
                              <span>{formatTime(m.createdAt, locale)}</span>
                              {m.edited && !m.deleted && <span>· {t("chat.edited")}</span>}
                              {mine &&
                                !m.deleted &&
                                (m.seen ? (
                                  <CheckCheck className="h-3.5 w-3.5" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                ))}
                            </div>
                          </div>
                          {!m.deleted && (
                            <div className="opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                              <ReactionPicker
                                onPick={(emoji) => react(m.id, emoji)}
                                align={mine ? "end" : "start"}
                              />
                            </div>
                          )}
                        </div>
                        {!m.deleted && m.reactions.length > 0 && (
                          <ReactionChips
                            reactions={m.reactions}
                            onToggle={(emoji) => react(m.id, emoji)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          </div>
          <p className="h-5 px-4 text-xs text-muted-foreground">
            {typing && t("chat.typing", { name: NAMES[typing].split(" ")[0] })}
          </p>
          <form onSubmit={send} className="flex items-center gap-2 border-t border-border/70 p-3">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("chat.placeholder")}
              aria-label={t("chat.placeholder")}
            />
            <Button type="submit" size="icon" disabled={!draft.trim()} aria-label={t("chat.send")}>
              <SendHorizontal />
            </Button>
          </form>
        </div>
      </PhoneFrame>
    </div>
  );
}

export default function PlaygroundChatPage() {
  const t = useTranslations("Playground");
  return (
    <Demo
      title={t("chat.title")}
      description={t("chat.description")}
      source="components/chat/chat-surface.tsx · components/chat/MessageAttachments.tsx"
      className="p-4 sm:p-5"
    >
      <ChatLab />
    </Demo>
  );
}
