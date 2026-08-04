"use client";

import { type ReactNode, Suspense, useEffect, useMemo, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { MessageSquare, MessageSquarePlus, Plus, Settings2, Wrench } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { CategoriesDialog } from "@/components/it-tickets/CategoriesDialog";
import {
  STATUS_BORDER,
  StatusBadge,
  type Status,
  type Ticket,
} from "@/components/it-tickets/shared";
import { TicketDialog } from "@/components/it-tickets/TicketDialog";
import { TicketWorkspace } from "@/components/it-tickets/TicketWorkspace";
import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useHasCapability } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { isoToday } from "@/lib/absences";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: ("alle" | Status)[] = ["alle", "offen", "bearbeitung", "closed"];
const STATUS_LABEL_KEY: Record<Status, "statusOffen" | "statusBearbeitung" | "statusClosed"> = {
  offen: "statusOffen",
  bearbeitung: "statusBearbeitung",
  closed: "statusClosed",
};

function currentMonth(): string {
  return isoToday().slice(0, 7);
}

const EMPTY_THREADS: NonNullable<
  ReturnType<typeof useQuery<typeof api.itTicketThreads.listStarted>>
> = [];

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-transparent bg-foreground text-background"
          : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

function TicketStats({ tickets, categories }: { tickets: Ticket[]; categories: string[] }) {
  const t = useTranslations("ItTickets");
  const [month, setMonth] = useState(currentMonth());

  const { rows, total } = useMemo(() => {
    const inMonth = tickets.filter((tk) => tk.date.slice(0, 7) === month);
    const counts = new Map<string, number>();
    for (const name of categories) counts.set(name, 0);
    for (const tk of inMonth) counts.set(tk.category, (counts.get(tk.category) ?? 0) + 1);
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { rows: entries, total: inMonth.length };
  }, [tickets, categories, month]);

  const max = Math.max(1, ...rows.map(([, count]) => count));

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">{t("statsTitle")}</h2>
          <span className="text-xs text-muted-foreground">{t("statsSubtitle")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs">
            <span className="font-semibold uppercase tracking-wide text-muted-foreground">
              {t("month")}
            </span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value || currentMonth())}
              className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </label>
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {t("totalTickets", { count: total })}
          </span>
        </div>
        {rows.length === 0 || total === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {t("noTicketsInMonth")}
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map(([name, count]) => (
              <div key={name} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-3 text-xs">
                <span className="truncate font-medium">{name}</span>
                <span className="h-4 overflow-hidden rounded-full bg-primary/10">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{
                      width: `${count > 0 ? Math.max(2, (count / max) * 100) : 0}%`,
                    }}
                  />
                </span>
                <span className="text-right font-mono text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TicketCard({
  ticket,
  onEdit,
  onDelete,
  onOpenChat,
  hasThread,
  canManageThreads,
}: {
  ticket: Ticket;
  onEdit: () => void;
  onDelete: () => void;
  onOpenChat: () => void;
  hasThread: boolean;
  canManageThreads: boolean;
}) {
  const t = useTranslations("ItTickets");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const setStatus = useMutation(api.itTickets.setStatus);
  const handleError = useErrorHandler();

  function changeStatus(status: Status) {
    setStatus({ ticketId: ticket._id, status })
      .then(() =>
        toast.success(
          t("statusChanged", {
            nr: ticket.nr,
            status: t(STATUS_LABEL_KEY[status]),
          }),
        ),
      )
      .catch(handleError);
  }

  const hasSfDetails = ticket.category === "SF" && (ticket.topic || ticket.camId || ticket.custNo);

  return (
    <Card className={cn("border-l-4", STATUS_BORDER[ticket.status])}>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-xs font-bold text-primary">
            #{String(ticket.nr).padStart(3, "0")}
          </span>
          <span className="text-sm font-semibold">{ticket.category}</span>
          <StatusBadge status={ticket.status} />
          <span className="text-xs text-muted-foreground">
            {formatIsoDate(ticket.date, locale)}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("byLabel", { name: ticket.createdByName || "–" })}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select value={ticket.status} onValueChange={(v) => changeStatus(v as Status)}>
              <SelectTrigger className="h-8 w-auto min-w-[8.5rem] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="offen">{t("statusOffen")}</SelectItem>
                <SelectItem value="bearbeitung">{t("statusBearbeitung")}</SelectItem>
                <SelectItem value="closed">{t("statusClosed")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={onEdit}>
              {tc("edit")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onDelete}
            >
              {tc("delete")}
            </Button>
            {(hasThread || canManageThreads) && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={hasThread ? t("thread.openChat") : t("thread.startChat")}
                title={hasThread ? t("thread.openChat") : t("thread.startChat")}
                onClick={onOpenChat}
              >
                {hasThread ? (
                  <MessageSquare className="size-4" />
                ) : (
                  <MessageSquarePlus className="size-4" />
                )}
              </Button>
            )}
          </div>
        </div>
        {hasSfDetails && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {ticket.topic && (
              <span>
                <b className="mr-1 uppercase tracking-wide text-muted-foreground">{t("topic")}</b>
                {ticket.topic}
              </span>
            )}
            {ticket.camId && (
              <span>
                <b className="mr-1 uppercase tracking-wide text-muted-foreground">{t("camId")}</b>
                {ticket.camId}
              </span>
            )}
            {ticket.custNo && (
              <span>
                <b className="mr-1 uppercase tracking-wide text-muted-foreground">{t("custNo")}</b>
                {ticket.custNo}
              </span>
            )}
          </div>
        )}
        {ticket.info && <p className="whitespace-pre-wrap text-sm">{ticket.info}</p>}
      </CardContent>
    </Card>
  );
}

function ItTicketsPageContent() {
  const t = useTranslations("ItTickets");
  const tc = useTranslations("Common");
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const router = useRouter();
  const params = useSearchParams();
  const canManageThreads = useHasCapability("manage_it_ticket_threads");

  const tickets = useQuery(api.itTickets.list);
  const categories = useQuery(api.itTickets.listCategories);
  const startedThreads = useQuery(api.itTicketThreads.listStarted) ?? EMPTY_THREADS;
  const ensureDefaultCategories = useMutation(api.itTickets.ensureDefaultCategories);
  const removeTicket = useMutation(api.itTickets.remove);

  useEffect(() => {
    if (categories !== undefined && categories.length === 0) {
      ensureDefaultCategories().catch(handleError);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  const [statusFilter, setStatusFilter] = useState<"alle" | Status>("alle");
  const [showAll, setShowAll] = useState(false);
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<Ticket | undefined>(undefined);
  const [categoriesDialogOpen, setCategoriesDialogOpen] = useState(false);

  const selectedTicketId = params.get("ticket") as Id<"itTickets"> | null;
  const threadTicketIds = useMemo(
    () => new Set(startedThreads.map((th) => th.ticketId)),
    [startedThreads],
  );

  const filtered = useMemo(() => {
    const rows = tickets ?? [];
    return statusFilter === "alle" ? rows : rows.filter((tk) => tk.status === statusFilter);
  }, [tickets, statusFilter]);
  const visible = showAll ? filtered : filtered.slice(0, 10);

  function openCreate() {
    setEditingTicket(undefined);
    setTicketDialogOpen(true);
  }

  function openEdit(ticket: Ticket) {
    setEditingTicket(ticket);
    setTicketDialogOpen(true);
  }

  async function deleteTicket(ticket: Ticket) {
    const confirmed = await confirm({
      title: tc("delete"),
      description: t("deleteTicketConfirm", { nr: ticket.nr }),
      details: [
        { label: tc("fieldNumber"), value: `#${ticket.nr}` },
        { label: tc("fieldCategory"), value: ticket.category },
        { label: tc("fieldDate"), value: ticket.date },
      ],
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!confirmed) return;
    removeTicket({ ticketId: ticket._id })
      .then(() => {
        toast.success(t("ticketDeleted", { nr: ticket.nr }));
        if (selectedTicketId === ticket._id) router.push("/it-tickets");
      })
      .catch(handleError);
  }

  function openChat(ticketId: Id<"itTickets">) {
    router.push(`/it-tickets?ticket=${ticketId}`);
  }

  function backToList() {
    router.push("/it-tickets");
  }

  if (selectedTicketId) {
    const selectedTicket = tickets?.find((tk) => tk._id === selectedTicketId);
    if (tickets !== undefined && !selectedTicket) {
      return (
        <div className="mx-auto max-w-md space-y-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">{t("notFoundFallback")}</p>
          <Button variant="outline" onClick={backToList}>
            {t("thread.backToList")}
          </Button>
        </div>
      );
    }
    if (!selectedTicket) return null;

    const otherThreadTickets = startedThreads
      .filter((th) => th.ticketId !== selectedTicketId)
      .map((th) => tickets?.find((tk) => tk._id === th.ticketId))
      .filter((tk): tk is Ticket => !!tk)
      .map((tk) => ({ ticketId: tk._id, nr: tk.nr, category: tk.category, status: tk.status }));

    return (
      <div className="h-full">
        <TicketWorkspace
          ticket={selectedTicket}
          otherThreads={otherThreadTickets}
          canManageThreads={canManageThreads}
          onBack={backToList}
          onEdit={() => openEdit(selectedTicket)}
          onDelete={() => void deleteTicket(selectedTicket)}
          onSelectTicket={openChat}
        />
        <TicketDialog
          open={ticketDialogOpen}
          onOpenChange={setTicketDialogOpen}
          categories={categories ?? []}
          ticket={editingTicket}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeaderBar title={t("pageTitle")} description={t("pageDescription")} icon={<Wrench />} />
      <PageHeaderActions
        actions={[
          {
            key: "categories",
            label: t("manageCategories"),
            icon: Settings2,
            onClick: () => setCategoriesDialogOpen(true),
            variant: "outline" as const
          },
          {
            key: "new-ticket",
            label: t("newTicket"),
            icon: Plus,
            onClick: openCreate,
          },
        ]}
      />

      <TicketStats tickets={tickets ?? []} categories={(categories ?? []).map((c) => c.name)} />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-1 text-sm font-semibold">{t("ticketsTitle")}</h2>
          {STATUS_FILTERS.map((s) => (
            <Pill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {s === "alle" ? t("filterAll") : t(STATUS_LABEL_KEY[s])}
            </Pill>
          ))}
          <label className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox checked={showAll} onCheckedChange={(v) => setShowAll(v === true)} />
            {t("showAll")}
          </label>
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {t("countLabel", { shown: visible.length, total: filtered.length })}
          </span>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={<Wrench />}
            title={
              statusFilter === "alle"
                ? t("noTickets")
                : t("noTicketsFiltered", {
                    status: t(STATUS_LABEL_KEY[statusFilter as Status]),
                  })
            }
          />
        ) : (
          <div className="space-y-2.5">
            {visible.map((ticket) => (
              <TicketCard
                key={ticket._id}
                ticket={ticket}
                onEdit={() => openEdit(ticket)}
                onDelete={() => deleteTicket(ticket)}
                onOpenChat={() => openChat(ticket._id)}
                hasThread={threadTicketIds.has(ticket._id)}
                canManageThreads={canManageThreads}
              />
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{t("sharedNote")}</p>

      <TicketDialog
        open={ticketDialogOpen}
        onOpenChange={setTicketDialogOpen}
        categories={categories ?? []}
        ticket={editingTicket}
      />
      <CategoriesDialog
        open={categoriesDialogOpen}
        onOpenChange={setCategoriesDialogOpen}
        categories={categories ?? []}
        tickets={tickets}
      />
    </div>
  );
}

export default function ItTicketsPage() {
  return (
    <Suspense fallback={null}>
      <ItTicketsPageContent />
    </Suspense>
  );
}
