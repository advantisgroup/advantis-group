import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The visual pieces a conversation is made of, shared by the chat and the
 * IT-ticket thread so the two can't drift apart — they already share the
 * composer for the same reason.
 *
 * The refreshed look follows how a reading surface like Claude's lays out a
 * conversation: one centred column rather than lines stretched across a wide
 * pane, soft shapes with no border (a bordered bubble inside a bordered pane
 * is a card inside a card), and dividers that are a hairline, not a pill.
 */

/** Touch-and-hold duration before the mobile message action sheet opens. */
export const LONG_PRESS_MS = 450;
/** Horizontal drag distance that counts as a swipe-to-reply on mobile. */
export const SWIPE_REPLY_THRESHOLD = 56;

/** Keeps a conversation to a readable measure on a wide screen. */
export const CHAT_COLUMN = "refreshed:mx-auto refreshed:w-full refreshed:max-w-3xl";

export function chatBubbleClass(mine: boolean) {
  return cn(
    "min-w-0 rounded-2xl px-3 py-2 text-sm",
    "refreshed:rounded-[18px] refreshed:px-3.5 refreshed:text-[14px] refreshed:leading-relaxed",
    mine
      ? "rounded-br-md bg-blue-500/15 text-foreground refreshed:rounded-br-[6px] refreshed:bg-foreground/[0.07]"
      : "rounded-bl-md bg-muted refreshed:rounded-bl-[6px] refreshed:bg-muted/65",
  );
}

export function ChatDayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-1">
      <span aria-hidden className="hidden h-px flex-1 bg-border/60 refreshed:block" />
      <span className="rounded-full bg-muted px-3 py-0.5 text-[11px] font-medium text-muted-foreground refreshed:rounded-none refreshed:bg-transparent refreshed:px-0 refreshed:text-[11.5px]">
        {label}
      </span>
      <span aria-hidden className="hidden h-px flex-1 bg-border/60 refreshed:block" />
    </div>
  );
}

/** Something that happened to the conversation rather than a message in it —
 * quiet enough not to be mistaken for one. */
export function ChatEvent({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center py-1">
      <span className="rounded-full bg-muted px-3 py-0.5 text-[11px] font-medium text-muted-foreground refreshed:rounded-none refreshed:bg-transparent refreshed:px-0 refreshed:text-[12px] refreshed:font-normal">
        {children}
      </span>
    </div>
  );
}
