"use client";

import { type InquiryState } from "@advantis/convex/marketing/inquiry";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const DOT: Record<InquiryState, string> = {
  open: "bg-muted-foreground/60",
  in_progress: "bg-warning",
  answered: "bg-success",
  closed: "bg-rule-strong",
  withdrawn: "bg-rule-strong",
};

/** Where the team is with an inquiry, in the customer's three-word vocabulary. */
export function StateLabel({ state, className }: { state: InquiryState; className?: string }) {
  const t = useTranslations("account.inquiries.states");
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", DOT[state])} />
      {t(state)}
    </span>
  );
}
