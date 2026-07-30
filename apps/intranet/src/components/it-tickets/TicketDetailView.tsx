"use client";

import { type api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type FunctionReturnType } from "convex/server";
import { ArrowLeft, MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  STATUS_BORDER,
  StatusBadge,
  type Status,
  type Ticket,
} from "@/components/it-tickets/shared";
import { Button } from "@/components/ui/button";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Thread = FunctionReturnType<typeof api.itTicketThreads.getForTicket>;

export interface OtherThreadTicket {
  ticketId: Id<"itTickets">;
  nr: number;
  category: string;
  status: Status;
}

export function TicketDetailView({
  ticket,
  thread,
  otherThreads,
  canManageThreads,
  onBack,
  onEdit,
  onDelete,
  onStartChat,
  onSelectTicket,
}: {
  ticket: Ticket;
  thread: Thread;
  otherThreads: OtherThreadTicket[];
  canManageThreads: boolean;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStartChat: () => void;
  onSelectTicket: (ticketId: Id<"itTickets">) => void;
}) {
  const t = useTranslations("ItTickets");
  const tc = useTranslations("Common");
  const locale = useLocale();

  const hasSfDetails = ticket.category === "SF" && (ticket.topic || ticket.camId || ticket.custNo);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="shrink-0 border-b border-border/70 p-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("thread.backToList")}
        </button>
      </div>

      <div
        className={cn(
          "space-y-3 border-b border-l-4 border-border/70 p-4",
          STATUS_BORDER[ticket.status],
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold text-primary">
            #{String(ticket.nr).padStart(3, "0")}
          </span>
          <span className="text-sm font-semibold">{ticket.category}</span>
          <StatusBadge status={ticket.status} />
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">{t("date")}</dt>
          <dd className="font-medium">{formatIsoDate(ticket.date, locale)}</dd>
          <dt className="text-muted-foreground">{t("createdBy")}</dt>
          <dd className="font-medium">{ticket.createdByName || "–"}</dd>
          {ticket.topic && (
            <>
              <dt className="text-muted-foreground">{t("topic")}</dt>
              <dd className="font-medium">{ticket.topic}</dd>
            </>
          )}
          {hasSfDetails && ticket.camId && (
            <>
              <dt className="text-muted-foreground">{t("camId")}</dt>
              <dd className="font-medium">{ticket.camId}</dd>
            </>
          )}
          {hasSfDetails && ticket.custNo && (
            <>
              <dt className="text-muted-foreground">{t("custNo")}</dt>
              <dd className="font-medium">{ticket.custNo}</dd>
            </>
          )}
        </dl>
        {ticket.info && <p className="whitespace-pre-wrap text-sm">{ticket.info}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="mr-1.5 size-3.5" />
            {tc("edit")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="mr-1.5 size-3.5" />
            {tc("delete")}
          </Button>
        </div>
        {!thread && canManageThreads && (
          <Button size="sm" className="w-full" onClick={onStartChat}>
            <MessageSquarePlus className="mr-1.5 size-3.5" />
            {t("thread.startChat")}
          </Button>
        )}
        {!thread && !canManageThreads && (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {t("thread.noThread")}
          </p>
        )}
      </div>

      {otherThreads.length > 0 && (
        <div className="min-h-0 flex-1 space-y-1 p-3">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("thread.otherThreads")}
          </p>
          {otherThreads.map((other) => (
            <button
              key={other.ticketId}
              type="button"
              onClick={() => onSelectTicket(other.ticketId)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <span className="font-mono text-xs font-bold text-primary">
                #{String(other.nr).padStart(3, "0")}
              </span>
              <span className="min-w-0 flex-1 truncate">{other.category}</span>
              <StatusBadge status={other.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
