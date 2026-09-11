import { type Doc } from "@advantis/convex/dataModel";
import { CircleCheck, CircleDashed, CircleDot, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export type Ticket = Doc<"itTickets">;
export type Status = Ticket["status"];

export const STATUSES: Status[] = ["offen", "bearbeitung", "closed"];

export const STATUS_LABEL_KEY: Record<
  Status,
  "statusOffen" | "statusBearbeitung" | "statusClosed"
> = {
  offen: "statusOffen",
  bearbeitung: "statusBearbeitung",
  closed: "statusClosed",
};

/** Theme tokens rather than Tailwind shades, so the list dot, the panel's top
 * edge and the status chip always agree — in both themes. */
export const STATUS_ACCENT: Record<Status, string> = {
  offen: "var(--warn)",
  bearbeitung: "var(--info)",
  closed: "var(--ok)",
};

export const STATUS_ICON: Record<Status, LucideIcon> = {
  offen: CircleDashed,
  bearbeitung: CircleDot,
  closed: CircleCheck,
};

export const STATUS_BORDER: Record<Status, string> = {
  offen: "border-l-warn",
  bearbeitung: "border-l-info",
  closed: "border-l-ok",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ATTENTION_OPEN_AGE_DAYS = 3;
const ATTENTION_IN_PROGRESS_AGE_DAYS = 7;

export function ticketAgeDays(ticket: Ticket, now = Date.now()): number {
  return Math.floor((now - ticket.createdAt) / DAY_MS);
}

export function ticketAttention(ticket: Ticket, now = Date.now()) {
  const ageDays = ticketAgeDays(ticket, now);
  if (ticket.status === "offen" && ageDays >= ATTENTION_OPEN_AGE_DAYS) {
    return { kind: "open" as const, ageDays };
  }
  if (ticket.status === "bearbeitung" && ageDays >= ATTENTION_IN_PROGRESS_AGE_DAYS) {
    return { kind: "inProgress" as const, ageDays };
  }
  return null;
}

export function ticketNumber(nr: number): string {
  return `#${String(nr).padStart(3, "0")}`;
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const t = useTranslations("ItTickets");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium",
        status === "closed" ? "text-muted-foreground" : "text-foreground",
        className,
      )}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: STATUS_ACCENT[status] }}
      />
      {t(STATUS_LABEL_KEY[status])}
    </span>
  );
}
