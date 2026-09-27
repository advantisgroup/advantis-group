"use client";

import { useMemo, useState } from "react";

import { useLocale, useTranslations } from "next-intl";

import { ticketAttention, type Ticket } from "@/components/it-tickets/shared";
import { type TicketAssignee } from "@/components/it-tickets/TicketPanel";
import { PersonLink } from "@/components/profile/PersonLink";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isoToday } from "@/lib/absences";
import { formatIsoDate, initials } from "@/lib/format";

// Categories take chart slots in the order they were created, so a category
// keeps its colour from month to month and between the strip and the filter.
export const CATEGORY_SLOTS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function categoryColor(categories: string[], name: string): string {
  return CATEGORY_SLOTS[categories.indexOf(name)] ?? "var(--muted-foreground)";
}

export function TicketMonthStrip({
  tickets,
  categories,
}: {
  tickets: Ticket[];
  categories: string[];
}) {
  const t = useTranslations("ItTickets");
  const locale = useLocale();
  const current = isoToday().slice(0, 7);
  const [month, setMonth] = useState(current);

  const months = useMemo(() => {
    const set = new Set(tickets.map((ticket) => ticket.date.slice(0, 7)));
    set.add(current);
    return [...set].sort().reverse();
  }, [tickets, current]);

  const inMonth = tickets.filter((ticket) => ticket.date.slice(0, 7) === month);
  const segments = categories
    .map((name) => ({
      name,
      color: categoryColor(categories, name),
      count: inMonth.filter((ticket) => ticket.category === name).length,
    }))
    .filter((segment) => segment.count > 0);

  function monthLabel(key: string) {
    const [year, monthIndex] = key.split("-").map(Number);
    return new Date(year, monthIndex - 1, 1).toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-1">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="h-7 w-auto gap-1.5 border-transparent bg-transparent px-2 text-xs font-medium text-foreground shadow-none hover:bg-accent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((key) => (
              <SelectItem key={key} value={key}>
                {monthLabel(key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="tabular-nums">{t("monthSummary", { count: inMonth.length })}</span>
      </div>
      {segments.length > 0 && (
        <>
          <span aria-hidden className="flex h-1.5 w-40 gap-0.5 overflow-hidden rounded-full">
            {segments.map((segment) => (
              <span key={segment.name} style={{ flex: segment.count, background: segment.color }} />
            ))}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {segments.map((segment) => (
              <span key={segment.name} className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-[2px]" style={{ background: segment.color }} />
                {segment.name}
                <span className="font-semibold tabular-nums text-foreground">{segment.count}</span>
              </span>
            ))}
          </span>
        </>
      )}
    </div>
  );
}

export function AssigneeCell({ assignee }: { assignee: TicketAssignee | undefined }) {
  const t = useTranslations("ItTickets");
  if (!assignee) return <span className="text-muted-foreground">{t("unassigned")}</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar className="size-6">
        {assignee.avatar && <AvatarImage src={assignee.avatar} alt="" />}
        <AvatarFallback className="text-[10px]">{initials(assignee.name)}</AvatarFallback>
      </Avatar>
      <PersonLink userId={assignee._id}>{assignee.name}</PersonLink>
    </span>
  );
}

export function OpenedLabel({ ticket }: { ticket: Ticket }) {
  const t = useTranslations("ItTickets");
  const locale = useLocale();
  const attention = ticketAttention(ticket);
  if (attention) {
    return (
      <span className="whitespace-nowrap font-medium text-warn">
        {t(attention.kind === "open" ? "attentionOpen" : "attentionInProgress", {
          days: attention.ageDays,
        })}
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap text-muted-foreground">
      {formatIsoDate(ticket.date, locale)}
    </span>
  );
}
