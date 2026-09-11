"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ArrowUpRight, Ellipsis, Link2, MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  STATUS_ACCENT,
  STATUS_ICON,
  STATUS_LABEL_KEY,
  STATUSES,
  StatusBadge,
  ticketAgeDays,
  ticketAttention,
  ticketNumber,
  type Status,
  type Ticket,
} from "@/components/it-tickets/shared";
import { TicketRelatedLinks } from "@/components/it-tickets/TicketDetailView";
import { TicketStatusHistory } from "@/components/it-tickets/TicketStatusHistory";
import { PersonLink } from "@/components/profile/PersonLink";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PropertyButton,
  SidePanel,
  SidePanelProperties,
  SidePanelSection,
  StatusChip,
} from "@/components/ui/side-panel";
import { TimelineOrder } from "@/components/ui/timeline";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TicketAssignee {
  _id: Id<"users">;
  name: string;
  avatar?: string | null;
}

function PersonChip({ person }: { person: TicketAssignee }) {
  return (
    <>
      <Avatar className="size-5">
        {person.avatar && <AvatarImage src={person.avatar} alt="" />}
        <AvatarFallback className="text-[9px]">{initials(person.name)}</AvatarFallback>
      </Avatar>
      <span className="truncate">{person.name}</span>
    </>
  );
}

export function TicketPanel({
  ticket,
  open,
  onOpenChange,
  assignees,
  canAssign,
  hasThread,
  canManageThreads,
  onEdit,
  onDelete,
  onOpenChat,
}: {
  ticket: Ticket | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignees: TicketAssignee[];
  canAssign: boolean;
  hasThread: boolean;
  canManageThreads: boolean;
  onEdit: (ticket: Ticket) => void;
  onDelete: (ticket: Ticket) => void;
  onOpenChat: (ticketId: Id<"itTickets">) => void;
}) {
  const tc = useTranslations("Common");
  // Holds the last ticket so the panel keeps its content while animating closed.
  const [shown, setShown] = useState(ticket);
  if (ticket && ticket !== shown) setShown(ticket);

  return (
    <SidePanel
      open={open && !!shown}
      onOpenChange={onOpenChange}
      title={shown ? ticketNumber(shown.nr) : ""}
      accent={shown ? STATUS_ACCENT[shown.status] : undefined}
      closeLabel={tc("close")}
      header={shown && <TicketPanelHeader ticket={shown} onEdit={onEdit} onDelete={onDelete} />}
    >
      {shown && (
        <TicketPanelBody
          ticket={shown}
          assignees={assignees}
          canAssign={canAssign}
          hasThread={hasThread}
          canManageThreads={canManageThreads}
          onOpenChat={onOpenChat}
        />
      )}
    </SidePanel>
  );
}

function TicketPanelHeader({
  ticket,
  onEdit,
  onDelete,
}: {
  ticket: Ticket;
  onEdit: (ticket: Ticket) => void;
  onDelete: (ticket: Ticket) => void;
}) {
  const t = useTranslations("ItTickets");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const history = useQuery(api.itTickets.listStatusHistory, { ticketId: ticket._id });
  const setStatus = useMutation(api.itTickets.setStatus);
  const handleError = useErrorHandler();

  const attention = ticketAttention(ticket);
  const latest = history?.[0]?.status === ticket.status ? history[0] : undefined;
  const shortDate = (ms: number) =>
    new Date(ms).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const ageDays = ticketAgeDays(ticket);
  const since =
    ticket.status === "offen"
      ? ageDays === 0
        ? t("openedToday")
        : t("attentionOpen", { days: ageDays })
      : !latest
        ? null
        : ticket.status === "bearbeitung"
          ? t("inProgressSince", { date: shortDate(latest.changedAt) })
          : t("closedOnBy", { date: shortDate(latest.changedAt), name: latest.changedByName });

  function changeStatus(status: Status) {
    if (status === ticket.status) return;
    setStatus({ ticketId: ticket._id, status })
      .then(() =>
        toast.success(t("statusChanged", { nr: ticket.nr, status: t(STATUS_LABEL_KEY[status]) })),
      )
      .catch(handleError);
  }

  function copyLink() {
    void navigator.clipboard
      .writeText(`${window.location.origin}/it-tickets?open=${ticket._id}`)
      .then(() => toast.success(t("linkCopied")));
  }

  return (
    <div className="md:pr-9">
      <div className="flex min-h-8 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-mono">{ticketNumber(ticket.nr)}</span>
        <span aria-hidden>·</span>
        <span className="truncate">{ticket.category}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto text-muted-foreground"
              aria-label={t("moreActions")}
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(ticket)}>
              <Pencil />
              {tc("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={copyLink}>
              <Link2 />
              {t("copyLink")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(ticket)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 />
              {tc("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-lg font-semibold leading-snug tracking-tight text-balance">
        {ticket.info || ticket.category}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <StatusChip
              accent={STATUS_ACCENT[ticket.status]}
              icon={STATUS_ICON[ticket.status]}
              label={t(STATUS_LABEL_KEY[ticket.status])}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {STATUSES.map((status) => (
              <DropdownMenuItem key={status} onClick={() => changeStatus(status)}>
                <StatusBadge status={status} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {since && (
          <span
            className={cn("text-xs", attention ? "font-medium text-warn" : "text-muted-foreground")}
          >
            {since}
          </span>
        )}
      </div>
    </div>
  );
}

function TicketPanelBody({
  ticket,
  assignees,
  canAssign,
  hasThread,
  canManageThreads,
  onOpenChat,
}: {
  ticket: Ticket;
  assignees: TicketAssignee[];
  canAssign: boolean;
  hasThread: boolean;
  canManageThreads: boolean;
  onOpenChat: (ticketId: Id<"itTickets">) => void;
}) {
  const t = useTranslations("ItTickets");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const setAssignee = useMutation(api.itTickets.setAssignee);
  const startThread = useMutation(api.itTicketThreads.start);
  const handleError = useErrorHandler();

  const assignee = assignees.find((person) => person._id === ticket.assignedToUserId);
  // The header already shows the first lines; only repeat the text when
  // there's more of it than the header can hold.
  const longInfo = !!ticket.info && (ticket.info.length > 140 || ticket.info.includes("\n"));

  function changeAssignee(assignedToUserId: Id<"users"> | undefined) {
    if (assignedToUserId === ticket.assignedToUserId) return;
    setAssignee({ ticketId: ticket._id, assignedToUserId })
      .then(() =>
        toast.success(
          assignedToUserId
            ? t("assigneeChanged", {
                name: assignees.find((person) => person._id === assignedToUserId)?.name ?? "—",
              })
            : t("assigneeCleared"),
        ),
      )
      .catch(handleError);
  }

  function startChat() {
    startThread({ ticketId: ticket._id })
      .then(() => onOpenChat(ticket._id))
      .catch(handleError);
  }

  const rows = [
    {
      label: t("assignee"),
      value: canAssign ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <PropertyButton>
              {assignee ? (
                <PersonChip person={assignee} />
              ) : (
                <span className="text-muted-foreground">{t("unassigned")}</span>
              )}
            </PropertyButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 w-60 overflow-y-auto">
            {assignees.map((person) => (
              <DropdownMenuItem
                key={person._id}
                onClick={() => changeAssignee(person._id)}
                className="gap-2"
              >
                <PersonChip person={person} />
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => changeAssignee(undefined)}>
              {t("unassigned")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : assignee ? (
        <PersonLink userId={assignee._id}>{assignee.name}</PersonLink>
      ) : (
        <span className="text-muted-foreground">{t("unassigned")}</span>
      ),
    },
    {
      label: t("createdBy"),
      value: <PersonLink userId={ticket.createdByUserId}>{ticket.createdByName || "–"}</PersonLink>,
    },
    { label: t("date"), value: formatIsoDate(ticket.date, locale) },
    ...(ticket.topic ? [{ label: t("topic"), value: ticket.topic }] : []),
    ...(ticket.camId
      ? [
          {
            label: t("camId"),
            value: <span className="font-mono text-[13px]">{ticket.camId}</span>,
          },
        ]
      : []),
    ...(ticket.custNo
      ? [
          {
            label: t("custNo"),
            value: <span className="font-mono text-[13px]">{ticket.custNo}</span>,
          },
        ]
      : []),
  ];

  return (
    <>
      <SidePanelSection title={t("details")}>
        <SidePanelProperties rows={rows} />
      </SidePanelSection>

      {longInfo && (
        <SidePanelSection title={t("description")}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{ticket.info}</p>
        </SidePanelSection>
      )}

      <div className="border-b border-border/60 py-4">
        <TicketRelatedLinks ticket={ticket} className="border-t-0 pt-0" />
      </div>

      <SidePanelSection
        title={t("statusHistory")}
        action={<TimelineOrder label={tc("newestFirst")} />}
      >
        <TicketStatusHistory ticket={ticket} />
      </SidePanelSection>

      <SidePanelSection
        title={t("chat")}
        action={
          hasThread ? (
            <Button variant="ghost" size="xs" onClick={() => onOpenChat(ticket._id)}>
              <ArrowUpRight />
              {t("thread.openChat")}
            </Button>
          ) : canManageThreads ? (
            <Button variant="ghost" size="xs" onClick={startChat}>
              <MessageSquarePlus />
              {t("thread.startChat")}
            </Button>
          ) : null
        }
      >
        {!hasThread && (
          <p className="text-sm text-muted-foreground">
            {canManageThreads ? t("thread.noThreadHint") : t("thread.noThread")}
          </p>
        )}
      </SidePanelSection>
    </>
  );
}
