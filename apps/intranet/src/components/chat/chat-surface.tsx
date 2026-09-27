import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The visual pieces a conversation is made of, shared by the chat and the
 * IT-ticket thread so the two can't drift apart — they already share the
 * composer for the same reason.
 *
 * The look follows how a reading surface like Claude's lays out a
 * conversation: one centred column rather than lines stretched across a wide
 * pane, soft shapes with no border (a bordered bubble inside a bordered pane
 * is a card inside a card), and dividers that are a hairline, not a pill.
 */

/** Touch-and-hold duration before the mobile message action sheet opens. */
export const LONG_PRESS_MS = 450;
/** Horizontal drag distance that counts as a swipe-to-reply on mobile. */
export const SWIPE_REPLY_THRESHOLD = 56;

/** Keeps a conversation to a readable measure on a wide screen. */
export const CHAT_COLUMN = "mx-auto w-full max-w-3xl";

export function chatBubbleClass(mine: boolean) {
  return cn(
    "min-w-0 rounded-2xl px-3 py-2 text-sm",
    "rounded-[18px] px-3.5 text-[14px] leading-relaxed",
    mine ? "text-foreground rounded-br-[6px] bg-foreground/[0.07]" : "rounded-bl-[6px] bg-muted/65",
  );
}

export function ChatDayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-1">
      <span aria-hidden className="h-px flex-1 bg-border/60 block" />
      <span className="py-0.5 font-medium text-muted-foreground rounded-none bg-transparent px-0 text-[11.5px]">
        {label}
      </span>
      <span aria-hidden className="h-px flex-1 bg-border/60 block" />
    </div>
  );
}

/** Something that happened to the conversation rather than a message in it —
 * quiet enough not to be mistaken for one. */
export function ChatEvent({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center py-1">
      <span className="py-0.5 text-muted-foreground rounded-none bg-transparent px-0 text-[12px] font-normal">
        {children}
      </span>
    </div>
  );
}
