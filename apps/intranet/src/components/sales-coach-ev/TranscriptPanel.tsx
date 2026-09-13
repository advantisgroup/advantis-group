"use client";

import { Fragment, useEffect, useRef } from "react";

import { Mic } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { WEAK_PHRASES } from "./constants";

/** Live transcript with weak-phrase highlighting; clicking a word looks it
 * up in the Wiki tab (see CallView's `onWordClick`). */
export function TranscriptPanel({
  transcript,
  interim,
  live,
  onWordClick,
}: {
  transcript: string;
  interim: string;
  live: boolean;
  onWordClick: (word: string) => void;
}) {
  const t = useTranslations("SalesCoachEv");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Follow the conversation as it's spoken.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, interim]);

  if (!transcript && !interim) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <span
          className={cn(
            "grid size-12 place-items-center rounded-full bg-muted text-muted-foreground",
            live && "animate-pulse bg-success/15 text-success",
          )}
        >
          <Mic className="size-5" />
        </span>
        <p className="max-w-sm text-sm text-muted-foreground">{t("transcriptEmpty")}</p>
      </div>
    );
  }

  const parts = transcript.split(/(\s+)/);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-6 text-[17px] leading-8 md:px-8">
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
                "cursor-pointer rounded-sm transition-colors hover:bg-accent",
                isWeak &&
                  "rounded bg-warning/15 px-0.5 underline decoration-warning/60 decoration-2",
              )}
            >
              {part}
            </span>
          );
        })}
        {interim && <span className="text-muted-foreground"> {interim}</span>}
      </div>
    </div>
  );
}
