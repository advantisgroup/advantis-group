"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  BookPlus,
  ExternalLink,
  MessageSquarePlus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { PersonLink } from "@/components/profile/PersonLink";
import { useIsManager } from "@/components/providers/current-user";
import {
  STATUS_ACCENT,
  STATUS_BORDER,
  StatusBadge,
  ticketNumber,
  type Status,
  type Ticket,
} from "@/components/it-tickets/shared";
import { TicketStatusHistory } from "@/components/it-tickets/TicketStatusHistory";
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
import { TimelineOrder } from "@/components/ui/timeline";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";
import { formatDuration } from "@/lib/updates";
import { cn } from "@/lib/utils";

// `| undefined` on top of the query's own `| null` — undefined while the
// query is still loading, null once it's confirmed there's no thread yet.
type Thread = FunctionReturnType<typeof api.itTickets.threads.getForTicket> | undefined;
type RelatedLinkType = "guidebook" | "announcement" | "error_measure" | "other";

const RELATED_LINK_TYPES: RelatedLinkType[] = [
  "guidebook",
  "announcement",
  "error_measure",
  "other",
];

const SLOW_RESPONSE_MS = 4 * 60 * 60 * 1000;

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
  const response = useQuery(api.itTickets.tickets.firstResponse, { ticketId: ticket._id });
  const isManager = useIsManager();
  const router = useRouter();
  const handleError = useErrorHandler();
  const createDraft = useMutation(api.drafts.drafts.create);
  const saveDraft = useMutation(api.drafts.drafts.save);
  const messages = useQuery(
    api.itTickets.threads.listMessages,
    isManager && thread ? { threadId: thread._id } : "skip",
  );

  async function saveToWiki() {
    const escape = (text: string) =>
      text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const replies = (messages ?? []).filter(
      (m) => m.kind === "message" && m.body && m.senderUserId !== ticket.createdByUserId,
    );
    const body = [
      ticket.info ? `<p>${escape(ticket.info).replace(/\n/g, "<br>")}</p>` : "",
      replies.length
        ? `<h3>${t("wikiFix")}</h3>${replies.map((m) => `<p>${escape(m.kind === "message" ? (m.body ?? "") : "")}</p>`).join("")}`
        : "",
      `<p>${t("wikiFromTicket", { nr: ticketNumber(ticket.nr) })}</p>`,
    ].join("");
    try {
      const draftId = await createDraft({ surface: "wikiEntry" });
      await saveDraft({
        surface: "wikiEntry",
        subjectKey: draftId,
        data: JSON.stringify({ thema: ticket.topic?.trim() || ticket.category, erklaerung: body }),
        href: `/guidebooks/draft/${draftId}`,
      });
      router.push(`/guidebooks/draft/${draftId}`);
    } catch (error) {
      handleError(error);
    }
  }

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
          "border-l-0 border-t-[3px]",
        )}
        style={{ borderTopColor: STATUS_ACCENT[ticket.status] }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{ticketNumber(ticket.nr)}</span>
          <span className="font-semibold text-base">{ticket.category}</span>
          <StatusBadge status={ticket.status} />
        </div>
        <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
          <dt className="text-muted-foreground">{t("date")}</dt>
          <dd className="font-medium">{formatIsoDate(ticket.date, locale)}</dd>
          <dt className="text-muted-foreground">{t("createdBy")}</dt>
          <dd className="font-medium">
            {ticket.createdByName ? (
              <PersonLink userId={ticket.createdByUserId}>{ticket.createdByName}</PersonLink>
            ) : (
              "–"
            )}
          </dd>
          {ticket.assignedToUserId && (
            <>
              <dt className="text-muted-foreground">{t("assignedToLabel")}</dt>
              <dd className="font-medium">
                {assigneeName ? (
                  <PersonLink userId={ticket.assignedToUserId}>{assigneeName}</PersonLink>
                ) : (
                  "–"
                )}
              </dd>
            </>
          )}
          {response && (
            <>
              <dt className="text-muted-foreground">{t("firstResponse")}</dt>
              <dd
                className={cn(
                  "tabular-nums",
                  response.respondedAt === null &&
                    ticket.status !== "closed" &&
                    Date.now() - response.createdAt > SLOW_RESPONSE_MS &&
                    "text-warning",
                )}
              >
                {response.respondedAt !== null
                  ? t("respondedAfter", {
                      duration: formatDuration(response.respondedAt - response.createdAt),
                    })
                  : ticket.status === "closed"
                    ? "–"
                    : t("waitingFor", {
                        duration: formatDuration(Date.now() - response.createdAt),
                      })}
              </dd>
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
          {isManager && ticket.status === "closed" && (
            <Button variant="outline" size="sm" onClick={() => void saveToWiki()}>
              <BookPlus className="mr-1.5 size-3.5" />
              {t("saveToWiki")}
            </Button>
          )}
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

      <div className="border-b border-border/70 px-4 py-3">
        <div className="mb-3 flex min-h-6 items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-muted-foreground">{t("statusHistory")}</h3>
          <TimelineOrder label={tc("newestFirst")} />
        </div>
        <TicketStatusHistory ticket={ticket} />
      </div>

      {otherThreads.length > 0 && (
        <div className="min-h-0 flex-1 space-y-1 p-3">
          <p className="px-1 text-muted-foreground text-xs font-medium normal-case tracking-normal">
            {t("thread.otherThreads")}
          </p>
          {otherThreads.map((other) => (
            <button
              key={other.ticketId}
              type="button"
              onClick={() => onSelectTicket(other.ticketId)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <span className="font-mono text-xs text-muted-foreground">
                {ticketNumber(other.nr)}
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

export function TicketRelatedLinks({ ticket, className }: { ticket: Ticket; className?: string }) {
  const t = useTranslations("ItTickets");
  const tc = useTranslations("Common");
  const handleError = useErrorHandler();
  const setRelatedLinks = useMutation(api.itTickets.tickets.setRelatedLinks);
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
    <div className={cn("space-y-1.5 border-t border-border/70 pt-3", className)}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground">{t("relatedLinks")}</h3>
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
              className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium hover:underline text-foreground"
            >
              <span className="truncate">{link.label}</span>
              <ExternalLink className="size-3 shrink-0" />
            </Link>
          ) : (
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium hover:underline text-foreground"
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
