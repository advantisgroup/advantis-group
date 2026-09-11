"use client";

import { useState, type ReactNode } from "react";

import { type Id } from "@advantis/convex/dataModel";

import { UserProfile } from "@/components/profile/UserProfile";
import { cn } from "@/lib/utils";

/**
 * A person's name inside a clickable row: reads as text, underlines on hover,
 * and opens their profile instead of whatever the row does. The wrapper stops
 * propagation for the dialog too — portal events still bubble through the
 * React tree, so a click inside the profile would otherwise open the row.
 */
export function PersonLink({
  userId,
  children,
  className,
}: {
  userId: Id<"users">;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="contents" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "min-w-0 truncate text-left decoration-foreground/40 underline-offset-[3px] hover:underline focus-visible:underline focus-visible:outline-none",
          className,
        )}
      >
        {children}
      </button>
      <UserProfile userId={open ? userId : null} open={open} onOpenChange={setOpen} />
    </span>
  );
}
