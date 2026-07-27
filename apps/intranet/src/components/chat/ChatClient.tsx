"use client";

import { useMemo, useState, type ReactNode } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  ChevronDown,
  MessageSquare,
  MoreVertical,
  Pin,
  PinOff,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ConversationView } from "@/components/chat/ConversationView";
import { NewConversationDialog } from "@/components/chat/NewConversationDialog";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GroupAvatar } from "@/components/ui/avatar-stack";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatNotifications } from "@/hooks/use-chat-notifications";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Conversation = FunctionReturnType<typeof api.chat.listConversations>[number];

export function ChatClient() {
  const t = useTranslations("Chat");
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("c") as Id<"conversations"> | null;
  const rejoinId = params.get("rejoin") as Id<"conversations"> | null;
  const conversations = useQuery(api.chat.listConversations);
  const rejoinDm = useMutation(api.chat.rejoinDm);
  const handleError = useErrorHandler();

  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const { permission, requestPermission } = useChatNotifications();

  function select(id: Id<"conversations">) {
    router.push(`/chat?c=${id}`);
  }

  const { pinned, active, archived } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (c: Conversation) => !q || c.title.toLowerCase().includes(q);
    const visible = (conversations ?? []).filter(match);
    return {
      pinned: visible.filter((c) => c.pinned && !c.archived),
      active: visible.filter((c) => !c.pinned && !c.archived),
      archived: visible.filter((c) => c.archived),
    };
  }, [conversations, search]);

  async function acceptRejoin() {
    if (!rejoinId) return;
    try {
      const { conversationId } = await rejoinDm({ conversationId: rejoinId });
      toast.success(t("rejoined"));
      router.replace(`/chat?c=${conversationId}`);
    } catch (e) {
      handleError(e);
      router.replace("/chat");
    }
  }

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Conversation list */}
      <div
        data-tour="tour-chat-list"
        className={cn(
          "flex w-full flex-col border-r border-border/70 bg-card/40 md:w-80",
          selected && "hidden md:flex",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
          <h2 className="font-display text-lg font-semibold tracking-tight">{t("title")}</h2>
          <div className="flex items-center gap-1">
            {permission === "default" && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("enableNotifications")}
                title={t("enableNotifications")}
                onClick={() => void requestPermission()}
              >
                <Bell className="h-5 w-5" />
              </Button>
            )}
            <NewConversationDialog onCreated={select} />
          </div>
        </div>

        {/* Re-invite acceptance banner */}
        {rejoinId && (
          <div className="m-2 flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
              <UserPlus className="h-4 w-4" />
            </span>
            <p className="min-w-0 flex-1 text-xs text-foreground">{t("rejoinPrompt")}</p>
            <Button size="sm" className="h-7 px-2.5" onClick={acceptRejoin}>
              {t("rejoin")}
            </Button>
            <button
              aria-label={t("dismiss")}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => router.replace("/chat")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Search */}
        {conversations && conversations.length > 0 && (
          <div className="px-2 pt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchConversations")}
                className="h-9 pl-8"
              />
            </div>
          </div>
        )}

        <ScrollArea className="flex-1">
          {conversations && conversations.length === 0 && (
            <div className="mx-3 mt-6 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-blue-500/30 bg-blue-500/5 px-6 py-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
                <MessageSquare className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{t("noConversations")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("noConversationsHint")}</p>
              </div>
              <NewConversationDialog onCreated={select} triggerVariant="cta" />
            </div>
          )}

          <div className="p-2">
            {pinned.length > 0 && <SectionLabel>{t("pinned")}</SectionLabel>}
            {pinned.map((c) => (
              <ConversationRow key={c._id} c={c} selected={selected === c._id} onSelect={select} />
            ))}

            {active.map((c) => (
              <ConversationRow key={c._id} c={c} selected={selected === c._id} onSelect={select} />
            ))}

            {archived.length > 0 && (
              <>
                <button
                  onClick={() => setShowArchived((v) => !v)}
                  className="mt-2 flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent"
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      !showArchived && "-rotate-90",
                    )}
                  />
                  {t("archived")} · {archived.length}
                </button>
                {showArchived &&
                  archived.map((c) => (
                    <ConversationRow
                      key={c._id}
                      c={c}
                      selected={selected === c._id}
                      onSelect={select}
                    />
                  ))}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Thread */}
      <div className={cn("min-w-0 flex-1", !selected && "hidden md:flex")}>
        {selected ? (
          <ConversationView conversationId={selected} onBack={() => router.push("/chat")} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
              <MessageSquare className="h-8 w-8" />
            </span>
            <div className="max-w-xs">
              <p className="text-base font-semibold text-foreground">{t("selectConversation")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("selectConversationHint")}</p>
            </div>
            <NewConversationDialog onCreated={select} triggerVariant="cta" />
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function ConversationRow({
  c,
  selected,
  onSelect,
}: {
  c: Conversation;
  selected: boolean;
  onSelect: (id: Id<"conversations">) => void;
}) {
  const t = useTranslations("Chat");
  const togglePin = useMutation(api.chat.togglePin);
  const toggleMute = useMutation(api.chat.toggleMute);
  const toggleArchive = useMutation(api.chat.toggleArchive);
  const handleError = useErrorHandler();

  const run = (fn: () => Promise<unknown>) => () => {
    fn().catch(handleError);
  };

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-accent",
        selected && "bg-accent",
      )}
    >
      <button
        onClick={() => onSelect(c._id)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {c.type === "group" ? (
          <GroupAvatar
            src={c.groupAvatar}
            memberAvatars={c.memberAvatars}
            memberNames={c.memberNames}
            name={c.title}
            className="size-10"
          />
        ) : (
          <Avatar className="size-10 shrink-0">
            {c.avatar && <AvatarImage src={c.avatar} alt={c.title} />}
            <AvatarFallback className="text-xs">{initials(c.title)}</AvatarFallback>
          </Avatar>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              {c.pinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
              <span
                className={cn("truncate text-sm", c.unread > 0 ? "font-semibold" : "font-medium")}
              >
                {c.title}
              </span>
              {c.muted && <BellOff className="h-3 w-3 shrink-0 text-muted-foreground" />}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {c.lastMessageAt ? relativeTime(c.lastMessageAt) : ""}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            {c.otherLeft ? (
              <p className="truncate text-xs italic text-muted-foreground">{t("otherLeftShort")}</p>
            ) : (
              <p
                className={cn(
                  "truncate text-xs",
                  c.unread > 0 ? "text-foreground/80" : "text-muted-foreground",
                )}
              >
                {c.lastMessagePreview}
              </p>
            )}
            {c.unread > 0 && !c.muted && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                {c.unread}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Row actions */}
      <ActionMenu
        ariaLabel={t("conversationOptions")}
        items={
          [
            {
              key: "pin",
              label: c.pinned ? t("unpin") : t("pin"),
              icon: c.pinned ? <PinOff /> : <Pin />,
              onSelect: run(() => togglePin({ conversationId: c._id })),
            },
            {
              key: "mute",
              label: c.muted ? t("unmute") : t("mute"),
              icon: c.muted ? <Bell /> : <BellOff />,
              onSelect: run(() => toggleMute({ conversationId: c._id })),
            },
            {
              key: "archive",
              label: c.archived ? t("unarchive") : t("archive"),
              icon: c.archived ? <ArchiveRestore /> : <Archive />,
              onSelect: run(() => toggleArchive({ conversationId: c._id })),
            },
          ] satisfies ActionMenuItem[]
        }
        trigger={
          <button
            aria-label={t("conversationOptions")}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-100 transition-opacity hover:bg-background hover:text-foreground md:opacity-0 md:group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        }
      />
    </div>
  );
}
