"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Info, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { type OtherThreadTicket, TicketDetailView } from "@/components/it-tickets/TicketDetailView";
import { type Ticket } from "@/components/it-tickets/shared";
import { TicketThreadView } from "@/components/it-tickets/TicketThreadView";
import { Button } from "@/components/ui/button";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * The two-pane ticket detail + chat layout, entered from the ticket list by
 * selecting a ticket (mirrors ChatClient's list/detail split, and takes the
 * mobile-drawer-for-secondary-content pattern from the announcement
 * composer's Options sheet). Desktop keeps both panes visible at once;
 * mobile shows one at a time — the chat when a thread exists (there's
 * nothing to chat about otherwise), with ticket details reachable through a
 * bottom-sheet "info" button instead of a persistent second column.
 */
export function TicketWorkspace({
  ticket,
  otherThreads,
  canManageThreads,
  onBack,
  onEdit,
  onDelete,
  onSelectTicket,
}: {
  ticket: Ticket;
  otherThreads: OtherThreadTicket[];
  canManageThreads: boolean;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSelectTicket: (ticketId: Id<"itTickets">) => void;
}) {
  const t = useTranslations("ItTickets");
  const isMobile = useIsMobile();
  const handleError = useErrorHandler();
  // undefined = still loading, null = confirmed no thread, object = exists.
  // Coercing undefined to null here would flash a "Start chat" button (and
  // let it be clicked into a conflict error) for tickets that already have
  // one, and flash the detail-only mobile layout before switching to chat.
  const thread = useQuery(api.itTicketThreads.getForTicket, { ticketId: ticket._id });
  const startThread = useMutation(api.itTicketThreads.start);
  const [detailsOpen, setDetailsOpen] = useState(false);

  function onStartChat() {
    startThread({ ticketId: ticket._id }).catch(handleError);
  }

  const detail = (
    <TicketDetailView
      ticket={ticket}
      thread={thread}
      otherThreads={otherThreads}
      canManageThreads={canManageThreads}
      onBack={onBack}
      onEdit={onEdit}
      onDelete={onDelete}
      onStartChat={onStartChat}
      onSelectTicket={onSelectTicket}
    />
  );

  const loadingPane = (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );

  const chat =
    thread === undefined ? (
      loadingPane
    ) : thread ? (
      <TicketThreadView thread={thread} ticketCreatorUserId={ticket.createdByUserId} />
    ) : (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium">{t("thread.noThread")}</p>
        <p className="text-xs text-muted-foreground">{t("thread.noThreadHint")}</p>
      </div>
    );

  if (isMobile) {
    if (thread === undefined) {
      return <div className="flex h-full flex-col overflow-hidden">{loadingPane}</div>;
    }
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {thread ? (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-border/70 px-3 py-2">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("thread.backToList")}
                onClick={onBack}
              >
                <ArrowLeft className="size-4" />
              </Button>
              <span className="font-mono text-xs font-bold text-primary">
                #{String(ticket.nr).padStart(3, "0")}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {ticket.category}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("thread.ticketDetails")}
                onClick={() => setDetailsOpen(true)}
              >
                <Info className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1">{chat}</div>
            <MobileDrawer
              open={detailsOpen}
              onOpenChange={setDetailsOpen}
              ariaLabel={t("thread.ticketDetails")}
            >
              {detail}
            </MobileDrawer>
          </>
        ) : (
          detail
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="w-80 shrink-0 border-r border-border/70">{detail}</div>
      <div className="min-w-0 flex-1">{chat}</div>
    </div>
  );
}
