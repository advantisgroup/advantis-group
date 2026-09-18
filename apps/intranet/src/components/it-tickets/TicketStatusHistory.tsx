"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";

import { STATUS_ACCENT, STATUS_LABEL_KEY, type Ticket } from "@/components/it-tickets/shared";
import { Timeline } from "@/components/ui/timeline";
import { formatDateTime } from "@/lib/format";

export function TicketStatusHistory({ ticket }: { ticket: Ticket }) {
  const t = useTranslations("ItTickets");
  const locale = useLocale();
  const history = useQuery(api.itTickets.tickets.listStatusHistory, { ticketId: ticket._id });

  if (history === undefined) {
    return <p className="text-xs text-muted-foreground">{t("statusHistoryLoading")}</p>;
  }

  // Tickets logged before status history existed have no rows; their creation
  // is still worth showing rather than an empty section.
  const entries =
    history.length > 0
      ? history.map((entry) => ({
          key: entry._id,
          title: entry.previousStatus
            ? t("statusHistoryChanged", { status: t(STATUS_LABEL_KEY[entry.status]) })
            : t("statusHistoryCreated"),
          meta: `${t("statusHistoryBy", { name: entry.changedByName })} · ${formatDateTime(entry.changedAt, locale)}`,
        }))
      : [
          {
            key: "created",
            title: t("statusHistoryCreated"),
            meta: `${t("statusHistoryBy", { name: ticket.createdByName })} · ${formatDateTime(ticket.createdAt, locale)}`,
          },
        ];

  return <Timeline entries={entries} accent={STATUS_ACCENT[ticket.status]} />;
}
