"use client";

import { useTranslations } from "next-intl";

import { AiButton } from "./AiButton";
import { type AskSubject, useAsk, useAskSubject } from "./ask-subject";

/**
 * "Ask about this" next to a record. While it's on screen the record is also
 * what ⌘K offers to ask about, so the keyboard route and the button always
 * mean the same thing.
 */
export function AskButton({
  subject,
  look = "pill",
  className,
}: {
  subject: AskSubject;
  look?: "pill" | "icon";
  className?: string;
}) {
  const t = useTranslations("Ai");
  const { ask } = useAsk();
  useAskSubject(subject);

  return (
    <AiButton
      look={look}
      aria-label={t("ask.action")}
      className={className}
      onClick={() => ask(subject)}
    >
      {look === "pill" ? t("ask.action") : null}
    </AiButton>
  );
}
