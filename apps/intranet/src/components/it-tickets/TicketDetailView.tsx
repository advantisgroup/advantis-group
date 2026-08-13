"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Clock3,
  ExternalLink,
  Link2,
  MessageSquarePlus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import {
  STATUS_BORDER,
  STATUS_LABEL_KEY,
  StatusBadge,
  type Status,
  type Ticket,
} from "@/components/it-tickets/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime, formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// `| undefined` on top of the query's own `| null` — undefined while the
// query is still loading, null once it's confirmed there's no thread yet.
type Thread = FunctionReturnType<typeof api.itTicketThreads.getForTicket> | undefined;
type RelatedLinkType = "guidebook" | "announcement" | "error_measure" | "other";

const RELATED_LINK_TYPES: RelatedLinkType[] = [
  "guidebook",
  "announcement",
  "error_measure",
  "other",
];

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
  assigneeName,
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
  assigneeName: string | undefined;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStartChat: () => void;
  onSelectTicket: (ticketId: Id<"itTickets">) => void;
}) {
  const t = useTranslations("ItTickets");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const statusHistory = useQuery(api.itTickets.listStatusHistory, { ticketId: ticket._id });

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
          {ticket.assignedToUserId && (
            <>
              <dt className="text-muted-foreground">{t("assignedToLabel")}</dt>
              <dd className="font-medium">{assigneeName ?? "–"}</dd>
            </>
          )}
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
        <TicketRelatedLinks ticket={ticket} />
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
        {thread === null && canManageThreads && (
          <Button size="sm" className="w-full" onClick={onStartChat}>
            <MessageSquarePlus className="mr-1.5 size-3.5" />
            {t("thread.startChat")}
          </Button>
        )}
        {thread === null && !canManageThreads && (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {t("thread.noThread")}
          </p>
        )}
      </div>

      <div className="space-y-2 border-b border-border/70 px-4 py-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Clock3 className="size-3.5" />
          {t("statusHistory")}
        </p>
        {statusHistory === undefined ? (
          <p className="text-xs text-muted-foreground">{t("statusHistoryLoading")}</p>
        ) : statusHistory.length === 0 ? (
          <StatusHistoryRow
            label={t("statusHistoryCreated")}
            name={ticket.createdByName}
            at={ticket.createdAt}
            locale={locale}
          />
        ) : (
          statusHistory.map((entry) => (
            <StatusHistoryRow
              key={entry._id}
              label={
                entry.previousStatus
                  ? t("statusHistoryChanged", { status: t(STATUS_LABEL_KEY[entry.status]) })
                  : t("statusHistoryCreated")
              }
              name={entry.changedByName}
              at={entry.changedAt}
              locale={locale}
            />
          ))
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

function TicketRelatedLinks({ ticket }: { ticket: Ticket }) {
  const t = useTranslations("ItTickets");
  const tc = useTranslations("Common");
  const handleError = useErrorHandler();
  const setRelatedLinks = useMutation(api.itTickets.setRelatedLinks);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<RelatedLinkType>("guidebook");
  const relatedLinks = ticket.relatedLinks ?? [];

  async function addLink() {
    if (!label.trim() || !url.trim()) return;
    try {
      await setRelatedLinks({
        ticketId: ticket._id,
        relatedLinks: [...relatedLinks, { type, label: label.trim(), url: url.trim() }],
      });
      setLabel("");
      setUrl("");
      setType("guidebook");
      setOpen(false);
    } catch (error) {
      handleError(error);
    }
  }

  async function removeLink(index: number) {
    try {
      await setRelatedLinks({
        ticketId: ticket._id,
        relatedLinks: relatedLinks.filter((_, linkIndex) => linkIndex !== index),
      });
    } catch (error) {
      handleError(error);
    }
  }

  return (
    <div className="space-y-1.5 border-t border-border/70 pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Link2 className="size-3.5" />
          {t("relatedLinks")}
        </p>
        {relatedLinks.length < 5 && (
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-3.5" />
            {t("addRelatedLink")}
          </Button>
        )}
      </div>
      {relatedLinks.map((link, index) => (
        <div
          key={`${link.url}-${link.label}`}
          className="flex items-center justify-between gap-2 rounded-md bg-muted/45 px-2 py-1.5"
        >
          {link.url.startsWith("/") ? (
            <Link
              href={link.url}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <span className="truncate">{link.label}</span>
              <ExternalLink className="size-3 shrink-0" />
            </Link>
          ) : (
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <span className="truncate">{link.label}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("removeRelatedLink", { label: link.label })}
            onClick={() => void removeLink(index)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={t("addRelatedLink")}
        contentClassName="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={() => void addLink()} disabled={!label.trim() || !url.trim()}>
              {tc("add")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("fieldRelatedLinkType")}
            </label>
            <Select value={type} onValueChange={(value) => setType(value as RelatedLinkType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATED_LINK_TYPES.map((linkType) => (
                  <SelectItem key={linkType} value={linkType}>
                    {t(`relatedLinkType.${linkType}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("fieldRelatedLinkLabel")}
            </label>
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t("fieldRelatedLinkLabelPlaceholder")}
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("fieldRelatedLinkUrl")}
            </label>
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={t("fieldRelatedLinkUrlPlaceholder")}
            />
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}

function StatusHistoryRow({
  label,
  name,
  at,
  locale,
}: {
  label: string;
  name: string;
  at: number;
  locale: string;
}) {
  const t = useTranslations("ItTickets");
  return (
    <div className="flex gap-2 text-xs">
      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground">
          {t("statusHistoryBy", { name })} · {formatDateTime(at, locale)}
        </p>
      </div>
    </div>
  );
}
