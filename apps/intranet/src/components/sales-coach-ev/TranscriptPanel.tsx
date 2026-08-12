"use client";

import { Fragment } from "react";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { WEAK_PHRASES } from "./constants";

/** Live transcript with weak-phrase highlighting; clicking a word looks it
 * up in the Wiki tab (see CallView's `onWordClick`). */
export function TranscriptPanel({
  transcript,
  interim,
  onWordClick,
}: {
  transcript: string;
  interim: string;
  onWordClick: (word: string) => void;
}) {
  const t = useTranslations("SalesCoachEv");

  if (!transcript && !interim) {
    return (
      <div className="flex-1 overflow-y-auto p-4 text-sm italic text-muted-foreground">
        {t("transcriptEmpty")}
      </div>
    );
  }

  const parts = transcript.split(/(\s+)/);

  return (
    <div className="flex-1 overflow-y-auto p-4 text-sm leading-loose">
      <span className="text-foreground">
        {parts.map((part, i) => {
          if (/^\s+$/.test(part)) return <Fragment key={i}>{part}</Fragment>;
          const word = part.replace(/[^a-zA-ZÀ-ɏ]/g, "");
          const isWeak = WEAK_PHRASES.some((w) => part.toLowerCase().startsWith(w));
          return (
            <span
              key={i}
              role="button"
              tabIndex={-1}
              title={isWeak ? t("weakFormulation") : undefined}
              onClick={() => word.length >= 3 && onWordClick(word)}
              className={cn(
                "cursor-pointer rounded-sm transition-colors hover:bg-primary/10",
                isWeak && "rounded bg-amber-100 px-0.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
              )}
            >
              {part}
            </span>
          );
        })}
      </span>
      {interim && <span className="text-muted-foreground italic"> {interim}</span>}
    </div>
  );
}
