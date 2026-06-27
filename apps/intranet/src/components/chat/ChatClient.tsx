"use client";

import { useQuery } from "convex/react";
import { MessageSquare } from "lucide-react";

import { useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useTranslations } from "next-intl";

import { ConversationView } from "@/components/chat/ConversationView";
import { NewConversationDialog } from "@/components/chat/NewConversationDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { initials, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ChatClient() {
  const t = useTranslations("Chat");
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("c") as Id<"conversations"> | null;
  const conversations = useQuery(api.chat.listConversations);

  function select(id: Id<"conversations">) {
    router.push(`/chat?c=${id}`);
  }

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100vh-4rem)] overflow-hidden bg-background md:-mx-8 md:-my-8">
      {/* Conversation list */}
      <div
        className={cn(
          "flex w-full flex-col border-r border-border/70 bg-card/40 md:w-80",
          selected && "hidden md:flex"
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {t("title")}
          </h2>
          <NewConversationDialog onCreated={select} />
        </div>
        <ScrollArea className="flex-1">
          {conversations && conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <MessageSquare className="h-5 w-5" />
              </span>
              <p className="text-sm text-muted-foreground">
                {t("noConversations")}
              </p>
            </div>
          )}
          <div className="p-2">
            {conversations?.map(c => (
              <button
                key={c._id}
                onClick={() => select(c._id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-accent",
                  selected === c._id && "bg-accent"
                )}
              >
                <Avatar className="size-10 shrink-0">
                  {c.avatar && <AvatarImage src={c.avatar} alt={c.title} />}
                  <AvatarFallback className="text-xs">
                    {initials(c.title)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "truncate text-sm",
                        c.unread > 0 ? "font-semibold" : "font-medium"
                      )}
                    >
                      {c.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {c.lastMessageAt ? relativeTime(c.lastMessageAt) : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        "truncate text-xs",
                        c.unread > 0
                          ? "text-foreground/80"
                          : "text-muted-foreground"
                      )}
                    >
                      {c.lastMessagePreview}
                    </p>
                    {c.unread > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                        {c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Thread */}
      <div className={cn("min-w-0 flex-1", !selected && "hidden md:flex")}>
        {selected ? (
          <ConversationView
            conversationId={selected}
            onBack={() => router.push("/chat")}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-muted">
              <MessageSquare className="h-7 w-7" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">
                {t("selectConversation")}
              </p>
              <p className="mt-0.5 text-xs">{t("selectConversationHint")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
