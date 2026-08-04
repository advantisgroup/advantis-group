"use client";

import { useState } from "react";

import { type Id } from "@advantis/convex/dataModel";

import { MentionCard } from "@/components/profile/MentionCard";
import { UserProfile } from "@/components/profile/UserProfile";
import { RichText } from "@/components/ui/rich-text";

/**
 * Drop-in replacement for `RichText` wherever the content might contain
 * @mentions — clicking one opens the compact `MentionCard` instead of the
 * full `UserProfile` dialog/drawer, with a button inside it to escalate to
 * the full profile if the reader wants more. Kept out of the ui/ layer
 * (unlike plain `RichText`) since it's Convex-aware.
 */
export function MentionRichText({
  html,
  className,
  autoSaveDates,
  sourcedDateSummary,
}: {
  html: string;
  className?: string;
  autoSaveDates?: boolean;
  sourcedDateSummary?: string;
}) {
  const [mention, setMention] = useState<{ userId: Id<"users">; rect: DOMRect } | null>(null);
  const [fullProfileId, setFullProfileId] = useState<Id<"users"> | null>(null);

  return (
    <>
      <RichText
        html={html}
        className={className}
        autoSaveDates={autoSaveDates}
        sourcedDateSummary={sourcedDateSummary}
        onMentionClick={(userId, target) =>
          setMention({ userId: userId as Id<"users">, rect: target.getBoundingClientRect() })
        }
      />
      {mention && (
        <MentionCard
          userId={mention.userId}
          rect={mention.rect}
          onClose={() => setMention(null)}
          onViewFullProfile={() => {
            setFullProfileId(mention.userId);
            setMention(null);
          }}
        />
      )}
      <UserProfile
        userId={fullProfileId}
        open={!!fullProfileId}
        onOpenChange={(o) => !o && setFullProfileId(null)}
      />
    </>
  );
}
