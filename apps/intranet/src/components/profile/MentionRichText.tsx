"use client";

import { useState } from "react";

import { type Id } from "@advantis/convex/dataModel";
import { useTranslations } from "next-intl";

import { MentionCard } from "@/components/profile/MentionCard";
import { UserProfile } from "@/components/profile/UserProfile";
import { RichDatePrompt } from "@/components/ui/rich-date-prompt";
import { RichText } from "@/components/ui/rich-text";
import { downloadCalendarEvent, hasCalendarPayload, type RichDateValue } from "@/lib/rich-date";

/**
 * Drop-in replacement for `RichText` wherever the content might contain
 * @mentions — clicking one opens the compact `MentionCard` instead of the
 * full `UserProfile` dialog/drawer, with a button inside it to escalate to
 * the full profile if the reader wants more. Kept out of the ui/ layer
 * (unlike plain `RichText`) since it's Convex-aware.
 */
export function MentionRichText({ html, className }: { html: string; className?: string }) {
  const t = useTranslations("RichText");
  const [mention, setMention] = useState<{ userId: Id<"users">; rect: DOMRect } | null>(null);
  const [fullProfileId, setFullProfileId] = useState<Id<"users"> | null>(null);
  const [datePrompt, setDatePrompt] = useState<{
    value: RichDateValue;
    summary: string;
  } | null>(null);

  return (
    <>
      <RichText
        html={html}
        className={className}
        onMentionClick={(userId, target) =>
          setMention({ userId: userId as Id<"users">, rect: target.getBoundingClientRect() })
        }
        onRichDateClick={(value, summary) => {
          if (hasCalendarPayload(value)) {
            downloadCalendarEvent(value, summary);
          } else {
            setDatePrompt({ value, summary });
          }
        }}
        richDateTitle={t("addToCalendar")}
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
      {datePrompt && (
        <RichDatePrompt
          open
          onOpenChange={(open) => !open && setDatePrompt(null)}
          value={datePrompt.value}
          summary={datePrompt.summary}
        />
      )}
    </>
  );
}
