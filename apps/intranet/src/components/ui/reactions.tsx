"use client";

import type { ReactNode } from "react";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { SmilePlus } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🙏"];

export interface Reaction {
  emoji: string;
  count: number;
  mine: boolean;
}

/** Emoji picker — renders `trigger` and opens a small palette on click. */
export function ReactionPicker({
  onPick,
  trigger,
  align = "start",
  side = "top",
}: {
  onPick: (emoji: string) => void;
  trigger?: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label="Add reaction"
            className="flex size-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            <SmilePlus className="size-4" />
          </button>
        )}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          side={side}
          sideOffset={6}
          className="z-50 flex items-center gap-0.5 rounded-full border border-border/70 bg-popover p-1 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
              className="flex size-8 items-center justify-center rounded-full text-lg transition-transform hover:scale-125 hover:bg-accent"
            >
              {emoji}
            </button>
          ))}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** Chips showing existing reactions; click a chip to toggle your own. */
export function ReactionChips({
  reactions,
  onToggle,
  className,
}: {
  reactions: Reaction[];
  onToggle: (emoji: string) => void;
  className?: string;
}) {
  if (reactions.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle(r.emoji)}
          className={cn(
            "flex h-6 items-center gap-1 rounded-full border px-1.5 text-xs tabular-nums transition-colors",
            r.mine
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:bg-accent",
          )}
        >
          <span className="text-sm leading-none">{r.emoji}</span>
          {r.count > 1 && <span>{r.count}</span>}
        </button>
      ))}
    </div>
  );
}
