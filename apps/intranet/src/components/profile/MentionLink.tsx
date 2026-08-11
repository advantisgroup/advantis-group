"use client";

import { useRef, useState } from "react";

import { type Id } from "@advantis/convex/dataModel";

import { MentionCard } from "@/components/profile/MentionCard";
import { UserProfile } from "@/components/profile/UserProfile";
import { cn } from "@/lib/utils";

/**
 * Inline plain-text @mention for auto-generated attribution copy (e.g.
 * "edited by <name>"). Unlike the rich-text `.mention` chip — a colored
 * Discord-style pill meant to stand out inside a message body — this reads
 * as ordinary text until interacted with: an underline on hover, and the
 * same compact `MentionCard` popout as any other mention on click.
 */
export function MentionLink({
  userId,
  children,
  className,
}: {
  userId: Id<"users">;
  children: React.ReactNode;
  className?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [fullProfileOpen, setFullProfileOpen] = useState(false);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setRect(buttonRef.current?.getBoundingClientRect() ?? null)}
        className={cn("underline-offset-2 hover:underline", className)}
      >
        {children}
      </button>
      {rect && (
        <MentionCard
          userId={userId}
          rect={rect}
          onClose={() => setRect(null)}
          onViewFullProfile={() => {
            setFullProfileOpen(true);
            setRect(null);
          }}
        />
      )}
      <UserProfile
        userId={fullProfileOpen ? userId : null}
        open={fullProfileOpen}
        onOpenChange={setFullProfileOpen}
      />
    </>
  );
}
