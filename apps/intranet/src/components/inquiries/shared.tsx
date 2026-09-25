import { type InquiryState } from "@advantis/convex/marketing/inquiry";
import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleSlash,
  HelpCircle,
  MessageSquare,
  Phone,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export const STATES: InquiryState[] = ["open", "in_progress", "answered", "closed", "withdrawn"];

/** Same tokens as the IT ticket statuses, so "open"/"in progress"/"done" read alike everywhere. */
export const STATE_ACCENT: Record<InquiryState, string> = {
  open: "var(--warn)",
  in_progress: "var(--info)",
  answered: "var(--ok)",
  closed: "var(--muted-foreground)",
  withdrawn: "var(--muted-foreground)",
};

const STATE_ICON: Record<InquiryState, LucideIcon> = {
  open: CircleDashed,
  in_progress: CircleDot,
  answered: CircleCheck,
  closed: CircleCheck,
  withdrawn: CircleSlash,
};

export const TYPE_ICON = { message: MessageSquare, callback: Phone, other: HelpCircle } as const;

export function StateBadge({ state, className }: { state: InquiryState; className?: string }) {
  const t = useTranslations("Inquiries");
  const Icon = STATE_ICON[state];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium", className)}
      style={{ color: STATE_ACCENT[state] }}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="text-foreground">{t(`states.${state}`)}</span>
    </span>
  );
}

/** "Max Mustermann · Acme GmbH", or the address when the name is missing. */
export const senderLine = (inquiry: {
  firstName: string;
  lastName: string;
  company?: string;
  email: string;
}) =>
  [`${inquiry.firstName} ${inquiry.lastName}`.trim() || inquiry.email, inquiry.company]
    .filter(Boolean)
    .join(" · ");
