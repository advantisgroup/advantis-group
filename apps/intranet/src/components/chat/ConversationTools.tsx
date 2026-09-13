"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Pin, PinOff, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateTime } from "@/lib/format";

/** Scroll a loaded message into view and flash it; false when it isn't loaded. */
export function jumpToMessage(messageId: string): boolean {
  const el = document.getElementById(`msg-${messageId}`);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("deeplink-hl");
  void el.offsetWidth;
  el.classList.add("deeplink-hl");
  return true;
}

function snippet(body: string, term: string) {
  const i = body.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return body;
  const start = Math.max(0, i - 40);
  return (
    <>
      {start > 0 && "…"}
      {body.slice(start, i)}
      <mark className="rounded bg-warning/25 px-0.5 text-inherit">
        {body.slice(i, i + term.length)}
      </mark>
      {body.slice(i + term.length, i + term.length + 80)}
    </>
  );
}

export function ConversationSearch({
  conversationId,
  onClose,
}: {
  conversationId: Id<"conversations">;
  onClose: () => void;
}) {
  const t = useTranslations("Chat");
  const locale = useLocale();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 200);
    return () => clearTimeout(id);
  }, [term]);

  const hits = useQuery(
    api.chat.searchMessages,
    debounced.length >= 2 ? { conversationId, term: debounced } : "skip",
  );

  return (
    <div className="border-b border-border/70 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
            placeholder={t("searchInConversation")}
            className="h-9 pl-8"
          />
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={t("closeSearch")} onClick={onClose}>
          <X />
        </Button>
      </div>
      {debounced.length >= 2 && (
        <div className="mt-2 max-h-64 overflow-y-auto">
          {hits === undefined ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">{t("searching")}</p>
          ) : hits.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">{t("noSearchResults")}</p>
          ) : (
            <ul className="space-y-0.5">
              {hits.map((hit) => (
                <li key={hit._id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!jumpToMessage(hit._id)) toast.info(t("messageNotLoaded"));
                    }}
                    className="w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent/60"
                  >
                    <span className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                      <span className="truncate font-medium text-foreground">{hit.senderName}</span>
                      <span className="shrink-0 tabular-nums">
                        {formatDateTime(hit.createdAt, locale)}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-sm">
                      {snippet(hit.body, debounced)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function PinnedMessagesBar({ conversationId }: { conversationId: Id<"conversations"> }) {
  const t = useTranslations("Chat");
  const locale = useLocale();
  const pinned = useQuery(api.chat.listPinnedMessages, { conversationId });
  const togglePin = useMutation(api.chat.togglePinMessage);
  const [open, setOpen] = useState(false);

  if (!pinned || pinned.length === 0) return null;
  const latest = pinned[0];

  return (
    <div className="flex items-center gap-2 border-b border-border/70 px-4 py-2">
      <Pin className="size-3.5 shrink-0 text-muted-foreground" />
      <button
        type="button"
        onClick={() => {
          if (!jumpToMessage(latest._id)) toast.info(t("messageNotLoaded"));
        }}
        className="min-w-0 flex-1 truncate text-left text-sm"
      >
        <span className="font-medium">{latest.senderName}: </span>
        <span className="text-muted-foreground">{latest.body || t("attachment")}</span>
      </button>
      {pinned.length > 1 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="xs" className="shrink-0 tabular-nums">
              {t("pinnedCount", { count: pinned.length })}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-1.5">
            <ul className="max-h-80 space-y-0.5 overflow-y-auto">
              {pinned.map((m) => (
                <li key={m._id} className="group flex items-start gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (!jumpToMessage(m._id)) toast.info(t("messageNotLoaded"));
                    }}
                    className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left hover:bg-accent/60"
                  >
                    <span className="flex justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate font-medium text-foreground">{m.senderName}</span>
                      <span className="shrink-0">{formatDateTime(m.createdAt, locale)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-sm">
                      {m.body || t("attachment")}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="mt-1 shrink-0"
                    aria-label={t("unpinMessage")}
                    onClick={() => void togglePin({ messageId: m._id })}
                  >
                    <PinOff />
                  </Button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
