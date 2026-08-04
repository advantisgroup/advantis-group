"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Cloud,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Link as LinkIcon,
  Megaphone,
  Pencil,
  Pin,
  Plus,
  Search,
  Tag,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { Link } from "@/components/Link";
import { MentionLink } from "@/components/profile/MentionLink";
import { MentionRichText } from "@/components/profile/MentionRichText";
import { isOwnerOrAdmin, useCurrentUser, useIsManager } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ReactionChips, ReactionPicker } from "@/components/ui/reactions";
import { htmlToText } from "@/components/ui/rich-text";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDeepLinkId } from "@/hooks/use-deep-link-id";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime, formatTime, initials } from "@/lib/format";
import { pathToUrl } from "@/lib/onedrive-path";
import { formatFileSize } from "@/lib/upload";
import { cn } from "@/lib/utils";

import { ALL_CATEGORIES_VALUE, type Announcement } from "@/lib/announcements";
import { CopyButton } from "@/components/activity/CopyButton";

function ViewersPopover({
  announcementId,
  count,
  total,
  canManage,
}: {
  announcementId: Id<"announcements">;
  count: number;
  /** Audience size — shown as "x / y" to the author/admins only. */
  total?: number;
  /** Author/admin gets a second tab listing who hasn't read it yet. */
  canManage: boolean;
}) {
  const t = useTranslations("Announcements");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"read" | "unread">("read");
  const viewers = useQuery(
    api.announcements.viewers,
    open && tab === "read" ? { announcementId } : "skip",
  );
  const nonReaders = useQuery(
    api.announcements.nonReaders,
    open && canManage && tab === "unread" ? { announcementId } : "skip",
  );

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTab("read");
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Eye className="h-3.5 w-3.5" />
          <span className="tabular-nums">
            {total !== undefined ? t("readStats", { count, total }) : t("viewedBy", { count })}
          </span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={6}
          className="z-50 max-h-80 w-64 overflow-y-auto rounded-lg border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          {canManage && (
            <div className="mb-1 grid grid-cols-2 gap-1 px-0.5 pb-1">
              <button
                type="button"
                onClick={() => setTab("read")}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  tab === "read"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60",
                )}
              >
                {t("viewedBy", { count })}
              </button>
              <button
                type="button"
                onClick={() => setTab("unread")}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  tab === "unread"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60",
                )}
              >
                {t("notReadYet")}
              </button>
            </div>
          )}
          {!canManage && (
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("viewedBy", { count })}
            </p>
          )}
          {tab === "read" ? (
            viewers === undefined ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">…</p>
            ) : viewers.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">{t("noViews")}</p>
            ) : (
              viewers.map((v) => (
                <div key={v.userId} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                  <Avatar className="size-6">
                    {v.avatar && <AvatarImage src={v.avatar} alt={v.name} />}
                    <AvatarFallback className="text-[9px]">{initials(v.name)}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate text-sm">{v.name}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatDateTime(v.readAt, locale)}
                  </span>
                </div>
              ))
            )
          ) : nonReaders === undefined ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">…</p>
          ) : nonReaders.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">{t("everyoneRead")}</p>
          ) : (
            nonReaders.map((v) => (
              <div key={v.userId} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                <Avatar className="size-6">
                  {v.avatar && <AvatarImage src={v.avatar} alt={v.name} />}
                  <AvatarFallback className="text-[9px]">{initials(v.name)}</AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate text-sm">{v.name}</span>
              </div>
            ))
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** Collapses long bodies behind a "read more" toggle. */
function CollapsibleBody({ html }: { html: string }) {
  const t = useTranslations("Announcements");
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el) setOverflowing(el.scrollHeight > 400);
  }, [html]);

  return (
    <div>
      <div
        ref={ref}
        className={cn("relative overflow-hidden", overflowing && !expanded && "max-h-80")}
      >
        <MentionRichText html={html} />
        {overflowing && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
        )}
      </div>
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3.5" />
              {t("showLess")}
            </>
          ) : (
            <>
              <ChevronDown className="size-3.5" />
              {t("readMore")}
            </>
          )}
        </button>
      )}
    </div>
  );
}

function AnnouncementCard({
  a,
  highlighted,
  onDelete,
  onOpenImage,
}: {
  a: Announcement;
  highlighted: boolean;
  onDelete: () => void;
  onOpenImage: (url: string, name: string) => void;
}) {
  const t = useTranslations("Announcements");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const me = useCurrentUser();
  const markRead = useMutation(api.announcements.markRead);
  const toggleReaction = useMutation(api.announcements.toggleReaction);
  const canManage = isOwnerOrAdmin(me, a.ownerId);
  const articleRef = useRef<HTMLElement>(null);

  // Deep link from a notification: scroll the matching card into view and
  // give it the same warm flash used elsewhere on landing.
  useEffect(() => {
    if (highlighted) {
      articleRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [highlighted]);

  // Mark as read only once the article has actually been scrolled into view —
  // keeps the unread dot and filter meaningful on long feeds.
  useEffect(() => {
    if (a.read || a.scheduled) return;
    const el = articleRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void markRead({ announcementId: a._id });
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [a._id, a.read, a.scheduled, markRead]);

  return (
    <article
      ref={articleRef}
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-shadow hover:shadow-[0_2px_4px_0_rgb(0_0_0/0.05),0_16px_36px_-20px_rgb(0_0_0/0.18)]",
        a.pinned && "border-primary/30",
        (a.scheduled || a.expired) && "opacity-80",
        highlighted && "deeplink-hl",
      )}
    >
      {a.pinned && <span className="absolute inset-y-0 left-0 w-1 bg-primary" />}
      {/* Header: author + title (left), date/time + actions (right). Stacks
          into two rows below `sm` instead of squeezing the title, badges,
          and action buttons into one cramped row — a plain `flex-wrap` on
          a single row doesn't reliably do this, since the title block's
          `flex-1` (flex-basis: 0%) + `min-w-0` gives it a zero hypothetical
          size for the browser's line-fitting math, so the always-visible
          action icons can keep "fitting" on line 1 while the title is the
          one actually being squeezed. */}
      <header className="flex flex-col gap-2 border-b border-border/60 px-4 py-3.5 sm:flex-row sm:items-start sm:gap-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Avatar className="size-9 shrink-0">
            {a.authorAvatar && <AvatarImage src={a.authorAvatar} alt={a.authorName} />}
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials(a.authorName, a.authorName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              {a.pinned && (
                <Pin
                  className="h-3.5 w-3.5 shrink-0 fill-primary text-primary"
                  aria-label={t("pinned")}
                />
              )}
              <h2 className="truncate font-display text-base font-semibold leading-tight">
                {a.title}
              </h2>
              {a.category && (
                <Badge
                  variant="muted"
                  className="min-w-0 shrink gap-1 font-normal"
                  title={a.category}
                >
                  <Tag className="size-3 shrink-0" />
                  <span className="truncate">{a.category}</span>
                </Badge>
              )}
              {!a.read && !a.scheduled && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
              {a.scheduled && (
                <Badge variant="warning" className="gap-1">
                  <CalendarClock className="size-3" />
                  {t("scheduledFor", {
                    date: formatDateTime(a.publishedAt, locale),
                  })}
                </Badge>
              )}
              {a.expired && <Badge variant="muted">{t("expired")}</Badge>}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {a.authorName}
              {a.updatedAt && (
                <>
                  {" · "}
                  {a.updatedByUserId && a.updatedByName ? (
                    <>
                      {t("editedBy")}{" "}
                      <MentionLink
                        userId={a.updatedByUserId}
                        className="font-medium text-foreground"
                      >
                        {a.updatedByName}
                      </MentionLink>
                    </>
                  ) : (
                    t("edited")
                  )}{" "}
                  {formatTime(a.updatedAt, "de-DE")}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 self-end sm:self-start">
          <CopyButton
            value={`https://intern.advantisgroup.de/announcements?id=${a._id}`}
            label="Copy announcement link"
          >
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground opacity-100 transition-opacity focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
            >
              <LinkIcon className="h-4 w-4" />
            </Button>
          </CopyButton>
          {canManage && (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("edit")}
                className="size-8 text-muted-foreground opacity-100 transition-opacity focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                asChild
              >
                <Link href={`/announcements/${a._id}/edit`}>
                  <Pencil className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={tc("delete")}
                className="size-8 text-muted-foreground opacity-100 transition-opacity hover:text-destructive focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}

          <time className="whitespace-nowrap text-xs text-muted-foreground">
            {formatDateTime(a.publishedAt, locale)}
          </time>
        </div>
      </header>

      {/* Styled message body */}
      <div className="px-5 py-4">
        <CollapsibleBody html={a.body} />
        {a.attachments.length > 0 && (
          <div className="mt-4 space-y-3">
            {/* Images embed inline */}
            {a.attachments.some((att) => att.kind === "image" && att.url) && (
              <div className="flex flex-wrap gap-2">
                {a.attachments
                  .filter((att) => att.kind === "image" && att.url)
                  .map((att) => {
                    const fromOneDrive = Boolean(att.oneDrivePath);
                    return fromOneDrive ? (
                      <a
                        key={att.storageId}
                        href={pathToUrl(att.oneDrivePath!)}
                        className="group/att relative block overflow-hidden rounded-lg border border-border"
                      >
                        <img
                          src={att.url ?? ""}
                          alt={att.name}
                          className="max-h-60 w-auto max-w-full object-cover transition-transform duration-200 group-hover/att:scale-[1.02]"
                        />
                        <span
                          title={tc("fromOneDrive")}
                          className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-background/90 shadow ring-1 ring-border"
                        >
                          <Cloud className="size-3.5 text-blue-500" />
                        </span>
                      </a>
                    ) : (
                      <button
                        key={att.storageId}
                        type="button"
                        onClick={() => onOpenImage(att.url ?? "", att.name)}
                        className="group/att relative block overflow-hidden rounded-lg border border-border"
                      >
                        <img
                          src={att.url ?? ""}
                          alt={att.name}
                          className="max-h-60 w-auto max-w-full object-cover transition-transform duration-200 group-hover/att:scale-[1.02]"
                        />
                      </button>
                    );
                  })}
              </div>
            )}

            {/* Other files show as chips with name + type/size */}
            {a.attachments.some((att) => att.kind !== "image") && (
              <div className="flex flex-wrap gap-2">
                {a.attachments
                  .filter((att) => att.kind !== "image")
                  .map((att) => {
                    const fromOneDrive = Boolean(att.oneDrivePath);
                    return (
                      <a
                        key={att.storageId}
                        href={fromOneDrive ? pathToUrl(att.oneDrivePath!) : (att.url ?? undefined)}
                        target={fromOneDrive ? undefined : "_blank"}
                        rel={fromOneDrive ? undefined : "noreferrer"}
                        download={fromOneDrive ? undefined : att.name}
                        className="group/att flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:bg-accent"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                          {fromOneDrive ? (
                            <Cloud className="size-4 text-blue-500" />
                          ) : (
                            <FileText className="size-4" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block max-w-[14rem] truncate text-sm font-medium">
                            {att.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {fromOneDrive
                              ? tc("fromOneDrive")
                              : [
                                  att.contentType?.split("/")[1]?.toUpperCase(),
                                  att.size != null ? formatFileSize(att.size) : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || t("attachments")}
                          </span>
                        </span>
                        {fromOneDrive ? (
                          <ExternalLink className="size-4 shrink-0 text-blue-500 opacity-0 transition-opacity group-hover/att:opacity-100" />
                        ) : (
                          <Download className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/att:opacity-100" />
                        )}
                      </a>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reactions + viewed status */}
      <div className="flex items-center gap-2 border-t border-border/60 px-5 py-2.5">
        <ReactionPicker
          side="top"
          onPick={(emoji) => void toggleReaction({ announcementId: a._id, emoji })}
        />
        <ReactionChips
          reactions={a.reactions}
          onToggle={(emoji) => void toggleReaction({ announcementId: a._id, emoji })}
        />
        <div className="ml-auto">
          <ViewersPopover
            announcementId={a._id}
            count={a.viewCount}
            total={canManage ? a.audienceCount : undefined}
            canManage={canManage}
          />
        </div>
      </div>
    </article>
  );
}

type Filter = "all" | "unread" | "pinned";
type Sort = "newest" | "reactions";

export default function AnnouncementsPage() {
  const t = useTranslations("Announcements");
  const tc = useTranslations("Common");
  const router = useRouter();
  const isManager = useIsManager();
  const confirm = useConfirm();
  const announcements = useQuery(api.announcements.list, {});
  const remove = useMutation(api.announcements.remove);
  const markAllRead = useMutation(api.announcements.markAllRead);
  const handleError = useErrorHandler();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES_VALUE);
  const [sort, setSort] = useState<Sort>("newest");
  const [lightbox, setLightbox] = useState<{
    url: string;
    name: string;
  } | null>(null);

  // Deep link from a notification: /announcements?id=<id> highlights the
  // matching card once the list has loaded.
  const highlightId = useDeepLinkId("id");

  async function onDelete(announcement: Announcement) {
    const ok = await confirm({
      title: t("deleteConfirm"),
      description: tc("deleteWarning"),
      details: [{ label: tc("fieldTitle"), value: announcement.title }],
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (ok) {
      try {
        await remove({ announcementId: announcement._id });
      } catch (e) {
        handleError(e);
      }
    }
  }

  const unreadCount = (announcements ?? []).filter((a) => !a.read && !a.scheduled).length;

  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    for (const a of announcements ?? []) {
      if (a.category && a.category !== ALL_CATEGORIES_VALUE) set.add(a.category);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [announcements]);

  const filtered = useMemo(() => {
    let rows = announcements ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((a) =>
        [a.title, htmlToText(a.body), a.authorName].some((field) =>
          field.toLowerCase().includes(q),
        ),
      );
    }
    if (filter === "unread") rows = rows.filter((a) => !a.read && !a.scheduled);
    if (filter === "pinned") rows = rows.filter((a) => a.pinned);
    if (categoryFilter !== ALL_CATEGORIES_VALUE)
      rows = rows.filter((a) => a.category === categoryFilter);
    if (sort === "reactions") {
      const score = (a: Announcement) => a.reactions.reduce((sum, r) => sum + r.count, 0);
      rows = [...rows].sort((a, b) => score(b) - score(a));
    }
    return rows;
  }, [announcements, search, filter, categoryFilter, sort]);

  const pinnedRows = filtered.filter((a) => a.pinned);
  const otherRows = filtered.filter((a) => !a.pinned);

  const renderCard = (a: Announcement) => (
    <AnnouncementCard
      key={a._id}
      a={a}
      highlighted={a._id === highlightId}
      onDelete={() => void onDelete(a)}
      onOpenImage={(url, name) => setLightbox({ url, name })}
    />
  );

  return (
    <div className="mx-auto max-w-3xl" data-tour="tour-announcements-list">
      <PageHeaderBar title={t("title")} tourCheckpoint="announcements" />
      <PageHeaderActions
        actions={
          isManager
            ? [
                {
                  key: "new",
                  label: t("new"),
                  icon: Plus,
                  onClick: () => router.push("/announcements/new"),
                  tourTarget: "tour-announcements-new",
                },
              ]
            : []
        }
      />

      {/* Search, filters, sort, mark-all-read */}
      <div
        className="mb-4 flex flex-wrap items-center gap-2"
        data-tour="tour-announcements-toolbar"
      >
        <div className="relative min-w-0 flex-1 basis-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tc("search")}
            className="pl-9"
          />
        </div>
        {(["all", "unread", "pinned"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === f
                ? "border-transparent bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {t(`filter_${f}`)}
            {f === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
          </button>
        ))}
        {existingCategories.length > 0 && (
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-8 w-auto gap-1.5 rounded-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES_VALUE}>{t("allCategories")}</SelectItem>
              {existingCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="h-8 w-auto gap-1.5 rounded-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{t("sortNewest")}</SelectItem>
            <SelectItem value="reactions">{t("sortReactions")}</SelectItem>
          </SelectContent>
        </Select>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => void markAllRead({})}
          >
            <CheckCheck className="mr-1.5 size-3.5" />
            {t("markAllRead")}
          </Button>
        )}
      </div>

      {announcements && announcements.length === 0 && (
        <EmptyState icon={<Megaphone />} title={t("empty")} />
      )}
      {announcements && announcements.length > 0 && filtered.length === 0 && (
        <EmptyState icon={<Search />} title={tc("noResults")} />
      )}

      <div className="space-y-6">
        {pinnedRows.length > 0 && otherRows.length > 0 ? (
          <>
            <section className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("pinnedSection")}
              </h2>
              {pinnedRows.map(renderCard)}
            </section>
            <section className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("latestSection")}
              </h2>
              {otherRows.map(renderCard)}
            </section>
          </>
        ) : (
          <div className="space-y-4">{filtered.map(renderCard)}</div>
        )}
      </div>

      {/* Image lightbox */}
      <Dialog open={lightbox !== null} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-4xl p-2">
          {lightbox && (
            <img
              src={lightbox.url}
              alt={lightbox.name}
              className="max-h-[80vh] w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
