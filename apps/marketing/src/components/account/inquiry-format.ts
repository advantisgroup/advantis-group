"use client";

import { useMemo } from "react";

import { type InquiryState, inquiryTitleParts } from "@advantis/convex/marketing/inquiry";
import { HelpCircle, MessageSquare, Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { Inquiry } from "@/lib/inquiries-server";

export const TYPE_ICON = { message: MessageSquare, callback: Phone, other: HelpCircle } as const;

/** Open or being worked on, as opposed to answered, closed or withdrawn. */
export const isActive = (state: InquiryState) => state === "open" || state === "in_progress";

export const isUpcomingCallback = (inquiry: Inquiry) =>
  inquiry.submissionType === "callback" &&
  inquiry.callbackStatus !== "cancelled" &&
  inquiry.desiredAt !== undefined &&
  inquiry.desiredAt > Date.now();

/** Something the customer should know about: a mail that didn't arrive. */
export const hasDeliveryProblem = (inquiry: Inquiry) =>
  ["failed", "bounced"].includes(inquiry.delivery.status) ||
  ["failed", "bounced"].includes(inquiry.copy.status ?? "");

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/**
 * Everything an inquiry needs to be read out: what to call it, a line of
 * preview, and its dates in the reader's language.
 */
export function useInquiryFormat() {
  const locale = useLocale();
  const t = useTranslations("account.inquiries");

  return useMemo(() => {
    const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
    const full = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short" });
    const shortDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
    const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

    const relative = (at: number) => {
      const seconds = Math.round((at - Date.now()) / 1000);
      for (const [unit, size] of STEPS) {
        if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
      }
      return rtf.format(0, "minute");
    };

    /** "3 hours ago" within the week, "25 Sep" after it. */
    const when = (at: number) =>
      Math.abs(Date.now() - at) < 7 * 86_400_000 ? relative(at) : shortDate.format(at);

    const title = (inquiry: Inquiry) => {
      const parts = inquiryTitleParts(inquiry);
      switch (parts.kind) {
        case "subject":
          return { title: parts.text, preview: inquiry.message };
        case "text":
          return { title: parts.text, preview: parts.rest || inquiry.company || "" };
        case "callback":
          return {
            title: parts.at
              ? t("callbackTitle", { when: dateTime.format(parts.at) })
              : t("types.callback"),
            preview: inquiry.notes || inquiry.company || "",
          };
        case "empty":
          return { title: t(`types.${inquiry.submissionType}`), preview: inquiry.company || "" };
      }
    };

    return {
      locale,
      dateTime,
      full,
      time,
      relative,
      when,
      title,
      state: (state: InquiryState) => t(`states.${state}`),
      type: (inquiry: Inquiry) => t(`types.${inquiry.submissionType}`),
    };
  }, [locale, t]);
}
