"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { Drawer } from "vaul";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { useIsMobile } from "@/hooks/use-mobile";
import { type Announcement } from "@/lib/announcements";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const LONG_PRESS_MS = 450;

/** Reaction chips with a small avatar stack per emoji. Tap toggles your own
 *  reaction as before; on mobile, holding a chip opens a drawer with a
 *  carousel of every reaction at the top and the full list of who gave the
 *  selected one below — the inline stack only ever ships a capped sample. */
export function ReactionsSummary({
  announcementId,
  reactions,
  onToggle,
}: {
  announcementId: Id<"announcements">;
  reactions: Announcement["reactions"];
  onToggle: (emoji: string) => void;
}) {
  const t = useTranslations("Announcements");
  const isMobile = useIsMobile();
  const [drawerEmoji, setDrawerEmoji] = useState<string | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);

  const reactors = useQuery(
    api.announcements.reactors,
    drawerEmoji !== null ? { announcementId } : "skip",
  );

  if (reactions.length === 0) return null;

  function clearLongPress() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function longPressHandlers(emoji: string) {
    return {
      onPointerDown: (e: ReactPointerEvent) => {
        if (e.pointerType !== "touch") return;
        clearLongPress();
        longPressTimer.current = window.setTimeout(() => {
          longPressTimer.current = null;
          suppressClick.current = true;
          navigator.vibrate?.(10);
          setDrawerEmoji(emoji);
        }, LONG_PRESS_MS);
      },
      onPointerUp: clearLongPress,
      onPointerLeave: clearLongPress,
      onPointerCancel: clearLongPress,
      onPointerMove: clearLongPress,
    };
  }

  function handlePillClick(emoji: string) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onToggle(emoji);
  }

  const rowsForSelected = (reactors ?? []).filter((r) => r.emoji === drawerEmoji);

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        {reactions.map((r) => (
          <button
            key={r.emoji}
            type="button"
            onClick={() => handlePillClick(r.emoji)}
            {...(isMobile ? longPressHandlers(r.emoji) : {})}
            className={cn(
              "flex h-6 items-center gap-1.5 rounded-full border pl-1.5 pr-2 text-xs tabular-nums transition-colors",
              r.mine
                ? "border-foreground/25 bg-foreground/[0.07] text-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent",
            )}
          >
            <span className="text-sm leading-none">{r.emoji}</span>
            <AvatarStack
              people={r.sample.map((s) => ({ id: s.userId, name: s.name, avatar: s.avatar }))}
              max={r.sample.length}
              size="size-4"
              className="-space-x-1.5"
            />
            <span>{r.count}</span>
          </button>
        ))}
      </div>

      {isMobile && (
        <Drawer.Root open={drawerEmoji !== null} onOpenChange={(o) => !o && setDrawerEmoji(null)}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
            <Drawer.Content
              aria-label={t("reactions")}
              aria-describedby={undefined}
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-background text-foreground shadow-2xl shadow-black/40 outline-none"
            >
              <Drawer.Title className="sr-only">{t("reactions")}</Drawer.Title>
              <div className="flex shrink-0 items-center justify-center pb-1 pt-3">
                <span className="h-1.5 w-10 rounded-full bg-border" />
              </div>

              <div className="flex shrink-0 gap-2 overflow-x-auto px-3 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {reactions.map((r) => (
                  <button
                    key={r.emoji}
                    type="button"
                    onClick={() => setDrawerEmoji(r.emoji)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                      drawerEmoji === r.emoji
                        ? "border-foreground/25 bg-foreground/[0.07] text-foreground"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    <span>{r.emoji}</span>
                    <span className="tabular-nums">{r.count}</span>
                  </button>
                ))}
              </div>

              <div
                className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2"
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
              >
                {reactors === undefined ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">…</p>
                ) : (
                  rowsForSelected.map((r) => (
                    <div key={r.userId} className="flex items-center gap-2 rounded-lg px-2 py-2">
                      <Avatar className="size-7">
                        {r.avatar && <AvatarImage src={r.avatar} alt={r.name} />}
                        <AvatarFallback className="text-[10px]">{initials(r.name)}</AvatarFallback>
                      </Avatar>
                      <span className="truncate text-sm">{r.name}</span>
                    </div>
                  ))
                )}
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      )}
    </>
  );
}
