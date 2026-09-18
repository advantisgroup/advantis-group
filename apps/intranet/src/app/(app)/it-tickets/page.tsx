"use client";

import { Suspense, useEffect, useMemo, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Bookmark,
  BookmarkPlus,
  MessageSquare,
  Plus,
  Search,
  Settings2,
  Wrench,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { CategoriesDialog } from "@/components/it-tickets/CategoriesDialog";
import {
  StatusBadge,
  STATUSES,
  STATUS_LABEL_KEY,
  ticketAttention,
  ticketNumber,
  type Status,
  type Ticket,
} from "@/components/it-tickets/shared";
import { TicketDialog } from "@/components/it-tickets/TicketDialog";
import { type TicketAssignee, TicketPanel } from "@/components/it-tickets/TicketPanel";
import { useFillPage } from "@/components/layout/fill-page";
import { TicketWorkspace } from "@/components/it-tickets/TicketWorkspace";
import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { PersonLink } from "@/components/profile/PersonLink";
import { useHasCapability, useIsManager } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CountTabs } from "@/components/ui/count-tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useConfirm,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterPill, TogglePill } from "@/components/ui/filter-pill";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { usePanelParam } from "@/hooks/use-panel-param";
import { isoToday } from "@/lib/absences";
import { formatIsoDate, initials } from "@/lib/format";

type StatusTab = "alle" | Status;
type SavedTicketView = {
  id: string;
  name: string;
  statusFilter: StatusTab | "attention" | "unassigned";
  showAll: boolean;
};

const PAGE_SIZE = 50;

// Categories take chart slots in the order they were created, so a category
// keeps its colour from month to month and between the strip and the filter.
const CATEGORY_SLOTS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function categoryColor(categories: string[], name: string): string {
  return CATEGORY_SLOTS[categories.indexOf(name)] ?? "var(--muted-foreground)";
}

const EMPTY_THREADS: NonNullable<
  ReturnType<typeof useQuery<typeof api.itTicketThreads.listStarted>>
> = [];

function TicketMonthStrip({ tickets, categories }: { tickets: Ticket[]; categories: string[] }) {
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

function AssigneeCell({ assignee }: { assignee: TicketAssignee | undefined }) {
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

function OpenedLabel({ ticket }: { ticket: Ticket }) {
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

function ItTicketsPageContent() {
  const t = useTranslations("ItTickets");
  const tc = useTranslations("Common");
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const router = useRouter();
  const params = useSearchParams();
  const canManageThreads = useHasCapability("manage_it_ticket_threads");
  const isManager = useIsManager();

  const tickets = useQuery(api.itTickets.list);
  const preferences = useQuery(api.userPreferences.getMine);
  const users = useQuery(api.users.list, {});
  const categories = useQuery(api.itTickets.listCategories);
  const startedThreads = useQuery(api.itTicketThreads.listStarted) ?? EMPTY_THREADS;
  const ensureDefaultCategories = useMutation(api.itTickets.ensureDefaultCategories);
  const removeTicket = useMutation(api.itTickets.remove);
  const setPreferences = useMutation(api.userPreferences.setMine);

  useEffect(() => {
    if (categories !== undefined && categories.length === 0) {
      ensureDefaultCategories().catch(handleError);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  const [tab, setTab] = useState<StatusTab>("alle");
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(() => params.get("filter") === "unassigned");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<Ticket | undefined>(undefined);
  const [categoriesDialogOpen, setCategoriesDialogOpen] = useState(false);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const savedTicketViews = preferences?.savedTicketViews ?? [];

  const selectedTicketId = params.get("ticket") as Id<"itTickets"> | null;
  // An open ticket is a full-height workspace; the list is a scrolling page.
  useFillPage(!!selectedTicketId);
  const { openId: panelTicketId, openPanel, closePanel } = usePanelParam("/it-tickets");
  const openNewFromUrl = !selectedTicketId && params.get("new") === "1";
  const categoryNames = useMemo(() => (categories ?? []).map((c) => c.name), [categories]);

  const threadTicketIds = useMemo(
    () => new Set(startedThreads.map((th) => th.ticketId)),
    [startedThreads],
  );
  const assignees = useMemo<TicketAssignee[]>(
    () =>
      (users ?? [])
        .filter((user) => user.status === "active")
        .map((user) => ({ _id: user._id, name: user.name, avatar: user.avatar })),
    [users],
  );
  const assigneeById = useMemo(
    () => new Map(assignees.map((user) => [String(user._id), user])),
    [assignees],
  );

  const query = search.trim().toLowerCase();
  // Everything except the status tab, so each tab's count says what switching
  // to it would actually show.
  const filteredByPills = useMemo(
    () =>
      (tickets ?? []).filter((ticket) => {
        if (categoryFilter.length > 0 && !categoryFilter.includes(ticket.category)) return false;
        if (assigneeFilter.length > 0 && !assigneeFilter.includes(ticket.assignedToUserId ?? "")) {
          return false;
        }
        if (attentionOnly && !ticketAttention(ticket)) return false;
        if (unassignedOnly && (ticket.status === "closed" || ticket.assignedToUserId)) return false;
        if (!query) return true;
        return [
          ticketNumber(ticket.nr),
          ticket.category,
          ticket.info,
          ticket.topic,
          ticket.createdByName,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      }),
    [tickets, categoryFilter, assigneeFilter, attentionOnly, unassignedOnly, query],
  );
  const rows = tab === "alle" ? filteredByPills : filteredByPills.filter((tk) => tk.status === tab);
  const visible = rows.slice(0, limit);

  const attentionCount = (tickets ?? []).filter((ticket) => ticketAttention(ticket)).length;
  const unassignedCount = (tickets ?? []).filter(
    (ticket) => ticket.status !== "closed" && !ticket.assignedToUserId,
  ).length;
  const filtersActive =
    categoryFilter.length > 0 ||
    assigneeFilter.length > 0 ||
    attentionOnly ||
    unassignedOnly ||
    query !== "";

  const categoryOptions = categoryNames.map((name) => ({
    value: name,
    label: name,
    count: (tickets ?? []).filter((ticket) => ticket.category === name).length,
    leading: (
      <span
        className="size-2 shrink-0 rounded-[2px]"
        style={{ background: categoryColor(categoryNames, name) }}
      />
    ),
  }));
  const assigneeOptions = assignees
    .map((person) => ({
      value: String(person._id),
      label: person.name,
      count: (tickets ?? []).filter((ticket) => ticket.assignedToUserId === person._id).length,
    }))
    .filter((option) => option.count > 0);

  function openCreate() {
    setEditingTicket(undefined);
    setTicketDialogOpen(true);
  }

  useEffect(() => {
    if (!openNewFromUrl) return;
    openCreate();
    router.replace("/it-tickets");
  }, [openNewFromUrl, router]);

  function openEdit(ticket: Ticket) {
    setEditingTicket(ticket);
    setTicketDialogOpen(true);
  }

  async function deleteTicket(ticket: Ticket) {
    const confirmed = await confirm({
      title: tc("delete"),
      description: t("deleteTicketConfirm", { nr: ticket.nr }),
      details: [
        { label: tc("fieldNumber"), value: ticketNumber(ticket.nr) },
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
        if (selectedTicketId === ticket._id || panelTicketId === ticket._id) {
          router.push("/it-tickets");
        }
      })
      .catch(handleError);
  }

  function openChat(ticketId: Id<"itTickets">) {
    router.push(`/it-tickets?ticket=${ticketId}`);
  }

  function backToList() {
    router.push("/it-tickets");
  }

  function clearFilters() {
    setCategoryFilter([]);
    setAssigneeFilter([]);
    setAttentionOnly(false);
    setUnassignedOnly(false);
    setSearch("");
  }

  function applySavedView(savedView: SavedTicketView) {
    // A saved view only stores a status, so it starts from a clean slate —
    // otherwise the same view would show different tickets depending on
    // whatever pills happened to be set before.
    clearFilters();
    const preset = savedView.statusFilter;
    setTab(preset === "attention" || preset === "unassigned" ? "alle" : preset);
    setAttentionOnly(preset === "attention");
    setUnassignedOnly(preset === "unassigned" && isManager);
    setLimit(PAGE_SIZE);
  }

  async function saveTicketView() {
    const name = viewName.trim();
    if (!name) return;
    const statusFilter: SavedTicketView["statusFilter"] = attentionOnly
      ? "attention"
      : unassignedOnly
        ? "unassigned"
        : tab;
    await setPreferences({
      savedTicketViews: [
        ...savedTicketViews,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name,
          statusFilter,
          showAll: true,
        },
      ].slice(-8),
    });
    setViewName("");
    setSaveViewOpen(false);
  }

  async function removeSavedView(id: string) {
    await setPreferences({
      savedTicketViews: savedTicketViews.filter((savedView) => savedView.id !== id),
    });
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
          assigneeName={assigneeById.get(String(selectedTicket.assignedToUserId))?.name}
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

  const panelTicket = tickets?.find((tk) => tk._id === panelTicketId);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeaderBar title={t("pageTitle")} description={t("pageDescription")} icon={<Wrench />} />
      <PageHeaderActions
        actions={[
          {
            key: "categories",
            label: t("manageCategories"),
            icon: Settings2,
            onClick: () => setCategoriesDialogOpen(true),
            variant: "outline" as const,
          },
          {
            key: "new-ticket",
            label: t("newTicket"),
            icon: Plus,
            onClick: openCreate,
          },
        ]}
      />

      <CountTabs
        value={tab}
        onChange={(value) => {
          setTab(value);
          setLimit(PAGE_SIZE);
        }}
        tabs={[
          { value: "alle", label: t("filterAll"), count: filteredByPills.length },
          ...STATUSES.map((status) => ({
            value: status,
            label: t(STATUS_LABEL_KEY[status]),
            count: filteredByPills.filter((ticket) => ticket.status === status).length,
          })),
        ]}
      />

      <div className="flex flex-col gap-2 py-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:w-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="h-9 pl-8 text-sm md:h-8 md:text-[13px]"
          />
        </div>
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-1 sm:flex-wrap sm:overflow-visible sm:px-0">
          <FilterPill
            label={t("category")}
            options={categoryOptions}
            selected={categoryFilter}
            onChange={setCategoryFilter}
            clearLabel={t("clearFilter", { label: t("category") })}
          />
          <FilterPill
            label={t("assignee")}
            options={assigneeOptions}
            selected={assigneeFilter}
            onChange={setAssigneeFilter}
            clearLabel={t("clearFilter", { label: t("assignee") })}
          />
          <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
          <TogglePill
            active={attentionOnly}
            onClick={() => setAttentionOnly((value) => !value)}
            count={attentionCount}
            dotClassName="bg-warn"
          >
            {t("needsAttention")}
          </TogglePill>
          {isManager && (
            <TogglePill
              active={unassignedOnly}
              onClick={() => setUnassignedOnly((value) => !value)}
              count={unassignedCount}
            >
              {t("unassigned")}
            </TogglePill>
          )}
          {filtersActive && (
            <Button variant="ghost" size="xs" className="shrink-0" onClick={clearFilters}>
              <X />
              {t("clearFilters")}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="xs" className="ml-auto shrink-0">
                <Bookmark />
                {t("views")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>{t("savedViews")}</DropdownMenuLabel>
              {savedTicketViews.length === 0 ? (
                <p className="px-2 pb-2 text-xs text-muted-foreground">{t("noViews")}</p>
              ) : (
                savedTicketViews.map((savedView) => (
                  <DropdownMenuItem
                    key={savedView.id}
                    onClick={() => applySavedView(savedView)}
                    className="group justify-between gap-2"
                  >
                    <span className="truncate">{savedView.name}</span>
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={t("removeSavedView", { name: savedView.name })}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        void removeSavedView(savedView.id);
                      }}
                      className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 group-focus:opacity-100 max-md:opacity-100"
                    >
                      <X className="size-3.5" />
                    </span>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSaveViewOpen(true)}>
                <BookmarkPlus />
                {t("saveView")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="pb-3">
        <TicketMonthStrip tickets={tickets ?? []} categories={categoryNames} />
      </div>

      {tickets === undefined ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Wrench />}
          title={tickets.length === 0 ? t("noTickets") : t("noResults")}
          action={
            filtersActive ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                {t("clearFilters")}
              </Button>
            ) : (
              <Button data-shortcut-new size="sm" onClick={openCreate}>
                <Plus />
                {t("newTicket")}
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-36">{t("columnTicket")}</TableHead>
                <TableHead>{t("columnDescription")}</TableHead>
                <TableHead className="w-36">{t("status")}</TableHead>
                <TableHead className="w-52">{t("assignee")}</TableHead>
                <TableHead className="w-40">{t("columnOpened")}</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">{t("chat")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((ticket) => (
                <TableRow
                  key={ticket._id}
                  tabIndex={0}
                  data-state={ticket._id === panelTicketId ? "selected" : undefined}
                  onClick={() => openPanel(ticket._id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") openPanel(ticket._id);
                  }}
                  className="cursor-pointer focus-visible:bg-muted/40 focus-visible:outline-none"
                >
                  <TableCell className="whitespace-nowrap">
                    <span className="font-mono text-xs text-muted-foreground">
                      {ticketNumber(ticket.nr)}
                    </span>
                    <span className="ml-2.5 font-medium">{ticket.category}</span>
                  </TableCell>
                  <TableCell className="w-full max-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      {ticket.topic && (
                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {ticket.topic}
                        </span>
                      )}
                      <span className="truncate">{ticket.info || "—"}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={ticket.status} />
                  </TableCell>
                  <TableCell className="max-w-52">
                    <AssigneeCell assignee={assigneeById.get(String(ticket.assignedToUserId))} />
                  </TableCell>
                  <TableCell>
                    <OpenedLabel ticket={ticket} />
                  </TableCell>
                  <TableCell className="text-right">
                    {threadTicketIds.has(ticket._id) && (
                      <MessageSquare className="ml-auto size-3.5 text-muted-foreground" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <ul className="divide-y divide-border/60 md:hidden">
            {visible.map((ticket) => (
              <li
                key={ticket._id}
                role="button"
                tabIndex={0}
                onClick={() => openPanel(ticket._id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") openPanel(ticket._id);
                }}
                className="space-y-1.5 px-4 py-3 active:bg-accent/60"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-muted-foreground">{ticketNumber(ticket.nr)}</span>
                  <span className="font-medium">{ticket.category}</span>
                  <StatusBadge status={ticket.status} className="ml-auto" />
                </div>
                <p className="line-clamp-2 text-sm">{ticket.info || "—"}</p>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <AssigneeCell assignee={assigneeById.get(String(ticket.assignedToUserId))} />
                  <span className="flex shrink-0 items-center gap-2">
                    {threadTicketIds.has(ticket._id) && (
                      <MessageSquare className="size-3.5 text-muted-foreground" />
                    )}
                    <OpenedLabel ticket={ticket} />
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-2.5 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {t("countLabel", { shown: visible.length, total: rows.length })}
            </span>
            {rows.length > limit && (
              <Button variant="ghost" size="xs" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                {t("showMore")}
              </Button>
            )}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">{t("sharedNote")}</p>

      <TicketPanel
        ticket={panelTicket}
        open={!!panelTicketId}
        onOpenChange={(open) => {
          if (!open) closePanel();
        }}
        assignees={assignees}
        canAssign={isManager}
        hasThread={!!panelTicket && threadTicketIds.has(panelTicket._id)}
        canManageThreads={canManageThreads}
        onEdit={openEdit}
        onDelete={(ticket) => void deleteTicket(ticket)}
        onOpenChat={openChat}
      />
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
      <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("saveViewTitle")}</DialogTitle>
            <DialogDescription>{t("saveViewDescription")}</DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="ticket-view-name" className="mb-2 block text-sm font-medium">
              {t("viewName")}
            </label>
            <Input
              id="ticket-view-name"
              value={viewName}
              onChange={(event) => setViewName(event.target.value)}
              placeholder={t("viewNamePlaceholder")}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveViewOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="button" disabled={!viewName.trim()} onClick={() => void saveTicketView()}>
              {t("saveView")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
