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
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-6xl overflow-hidden rounded-lg border bg-card">
      {/* Conversation list */}
      <div
        className={cn(
          "flex w-full flex-col border-r md:w-80",
          selected && "hidden md:flex"
        )}
      >
        <div className="flex items-center justify-between border-b p-3">
          <h2 className="font-semibold">{t("title")}</h2>
          <NewConversationDialog onCreated={select} />
        </div>
        <ScrollArea className="flex-1">
          {conversations && conversations.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {t("noConversations")}
            </p>
          )}
          {conversations?.map((c) => (
            <button
              key={c._id}
              onClick={() => select(c._id)}
              className={cn(
                "flex w-full items-center gap-3 border-b px-3 py-2.5 text-left hover:bg-muted",
                selected === c._id && "bg-muted"
              )}
            >
              <Avatar className="h-10 w-10">
                {c.avatar && <AvatarImage src={c.avatar} alt={c.title} />}
                <AvatarFallback>{initials(c.title)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{c.title}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {c.lastMessageAt ? relativeTime(c.lastMessageAt) : ""}
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {c.lastMessagePreview}
                </p>
              </div>
              {c.unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                  {c.unread}
                </span>
              )}
            </button>
          ))}
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
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <MessageSquare className="h-10 w-10" />
            <p className="text-sm">{t("selectConversation")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
