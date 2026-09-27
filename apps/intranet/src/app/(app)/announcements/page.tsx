"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  CheckCheck,
  ChevronDown,
  CircleCheck,
  ChevronUp,
  Download,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Megaphone,
  MoreVertical,
  Pencil,
  Pin,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { useAsk } from "@/components/ai/ask-subject";
import { useAiEnabled } from "@/components/ai/use-ai-enabled";
import { Mark } from "@/components/branding/ProviderMark";
import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { ReactionsSummary } from "@/components/announcements/ReactionsSummary";
import { RelevantDateCallout } from "@/components/announcements/RelevantDateCallout";
import { ViewersSummary } from "@/components/announcements/ViewersSummary";
import { MentionLink } from "@/components/profile/MentionLink";
import { MentionRichText } from "@/components/profile/MentionRichText";
import { isOwnerOrAdmin, useCurrentUser, useIsManager } from "@/components/providers/current-user";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountTabs } from "@/components/ui/count-tabs";
import { Dialog, DialogContent, useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterPill } from "@/components/ui/filter-pill";
import { Input } from "@/components/ui/input";
import { ReactionPicker } from "@/components/ui/reactions";
import { htmlToText } from "@/components/ui/rich-text";
import { useDeepLinkId } from "@/hooks/use-deep-link-id";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime, initials } from "@/lib/format";
import { pathToUrl } from "@/lib/onedrive-path";
import { formatFileSize } from "@/lib/upload";
import { cn } from "@/lib/utils";

import { ALL_CATEGORIES_VALUE, type Announcement } from "@/lib/announcements";

/** Collapses long bodies behind a "read more" toggle. */
function CollapsibleBody({ html, title }: { html: string; title: string }) {
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
        <MentionRichText html={html} sourcedDateSummary={title} />
        {overflowing && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t to-transparent from-background" />
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
  const router = useRouter();
  const markRead = useMutation(api.announcements.markRead);
  const toggleReaction = useMutation(api.announcements.toggleReaction);
  const acknowledge = useMutation(api.announcements.acknowledge);
  const { ask } = useAsk();
  const aiEnabled = useAiEnabled();
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

  const menuItems: ActionMenuItem[] = [
    {
      key: "copy",
      label: tc("copy"),
      icon: <LinkIcon />,
      onSelect: () => {
        const promise = navigator.clipboard.writeText(
          `https://intern.advantisgroup.de/announcements?id=${a._id}`,
        );
        toast.promise(promise, {
          loading: tc("copy"),
          success: tc("copied"),
          error: tc("copyFailed"),
        });
      },
    },
    ...(aiEnabled
      ? [
          {
            key: "ask",
            label: t("askAbout"),
            icon: <Sparkles />,
            onSelect: () => ask({ type: "announcement", id: a._id, label: a.title }),
          },
        ]
      : []),
    ...(canManage
      ? [
          {
            key: "edit",
            label: tc("edit"),
            icon: <Pencil />,
            onSelect: () => router.push(`/announcements/${a._id}/edit`),
          },
          {
            key: "delete",
            label: tc("delete"),
            icon: <Trash2 />,
            destructive: true,
            onSelect: onDelete,
          },
        ]
      : []),
  ];

  return (
    <article
      ref={articleRef}
      className={cn(
        "group relative -mx-2 flex gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/40",
        // Posts read as text split by hairlines, not rows of cards.
        "mx-0 gap-3.5 rounded-none px-0 py-5 hover:bg-transparent",
        (a.scheduled || a.expired) && "opacity-70",
        highlighted && "deeplink-hl",
      )}
    >
      <Avatar className="size-9 shrink-0">
        {a.authorAvatar && <AvatarImage src={a.authorAvatar} alt={a.authorName} />}
        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
          {initials(a.authorName, a.authorName)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 pr-8">
          {a.pinned && (
            <Pin
              className="h-3.5 w-3.5 shrink-0 fill-primary text-primary"
              aria-label={t("pinned")}
            />
          )}
          <span className="truncate text-sm font-semibold">{a.authorName}</span>
          <time className="shrink-0 text-xs text-muted-foreground">
            {formatDateTime(a.publishedAt, locale)}
          </time>
          {!a.read && !a.scheduled && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          )}
          {a.updatedAt && (
            <span className="shrink-0 text-xs text-muted-foreground">
              ·{" "}
              {a.updatedByUserId && a.updatedByName ? (
                <>
                  {t("editedBy")}{" "}
                  <MentionLink userId={a.updatedByUserId} className="font-medium text-foreground">
                    {a.updatedByName}
                  </MentionLink>
                </>
              ) : (
                t("edited")
              )}
            </span>
          )}
          {a.category && (
            <Badge variant="muted" className="min-w-0 shrink gap-1 font-normal" title={a.category}>
              <Tag className="size-3 shrink-0" />
              <span className="truncate">{a.category}</span>
            </Badge>
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

        <div className="min-w-0 overflow-hidden border-border/60 mt-2 rounded-none border-0 bg-transparent p-0">
          {a.relevantDate && (
            <RelevantDateCallout
              value={a.relevantDate}
              summary={a.title}
              className="mb-3 mx-0 mt-0 rounded-lg border"
            />
          )}
          <h2 className="font-display font-semibold text-lg tracking-tight">{a.title}</h2>
          <div className="mt-1">
            <CollapsibleBody html={a.body} title={a.title} />
          </div>
          {a.attachments.length > 0 && (
            <div className="mt-3 space-y-3">
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
                            <Mark provider="onedrive" className="size-3.5" />
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
                          href={
                            fromOneDrive ? pathToUrl(att.oneDrivePath!) : (att.url ?? undefined)
                          }
                          target={fromOneDrive ? undefined : "_blank"}
                          rel={fromOneDrive ? undefined : "noreferrer"}
                          download={fromOneDrive ? undefined : att.name}
                          className="group/att flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:bg-accent"
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                            {fromOneDrive ? (
                              <Mark provider="onedrive" className="size-4" />
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
                            <ExternalLink className="size-4 shrink-0 text-blue-500 opacity-100 transition-opacity md:opacity-0 md:group-hover/att:opacity-100" />
                          ) : (
                            <Download className="size-4 shrink-0 text-muted-foreground opacity-100 transition-opacity md:opacity-0 md:group-hover/att:opacity-100" />
                          )}
                        </a>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </div>

        {a.requiresAck && (
          <div
            className={cn(
              "mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-2.5 text-sm",
              a.ackedByMe ? "border-border/60 bg-muted/30" : "border-primary/30 bg-primary/5",
            )}
          >
            {a.ackedByMe ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <CircleCheck className="size-4 text-success" />
                {t("ackDone")}
              </span>
            ) : (
              <>
                <span className="min-w-0 flex-1">{t("ackPrompt")}</span>
                <Button
                  size="sm"
                  onClick={() =>
                    void acknowledge({ announcementId: a._id }).then(() =>
                      toast.success(t("ackThanks")),
                    )
                  }
                >
                  {t("ackConfirm")}
                </Button>
              </>
            )}
            {canManage && (
              <span className="basis-full text-xs tabular-nums text-muted-foreground">
                {t("ackCount", { count: a.ackCount, total: a.audienceCount })}
              </span>
            )}
          </div>
        )}

        {/* Reactions + viewed status. Wraps instead of squeezing the chips
            when a popular post collects more reactions than a narrow screen
            has room for on one line. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <ReactionPicker
            side="top"
            onPick={(emoji) => void toggleReaction({ announcementId: a._id, emoji })}
          />
          <ReactionsSummary
            announcementId={a._id}
            reactions={a.reactions}
            onToggle={(emoji) => void toggleReaction({ announcementId: a._id, emoji })}
          />
          <div className="ml-auto">
            <ViewersSummary
              announcementId={a._id}
              sample={a.viewerSample}
              count={a.viewCount}
              total={canManage ? a.audienceCount : undefined}
              canManage={canManage}
            />
          </div>
        </div>
      </div>

      <div className="absolute right-2 top-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <ActionMenu
          ariaLabel={t("actions")}
          items={menuItems}
          trigger={
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={t("actions")}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          }
        />
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
    <div className="mx-auto max-w-4xl" data-tour="tour-announcements-list">
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

      <div className="mb-1" data-tour="tour-announcements-toolbar">
        <CountTabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "all", label: t("filter_all"), count: announcements?.length },
            { value: "unread", label: t("filter_unread"), count: unreadCount },
            {
              value: "pinned",
              label: t("filter_pinned"),
              count: (announcements ?? []).filter((a) => a.pinned).length,
            },
          ]}
        />
        <div className="flex flex-col gap-2 py-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tc("search")}
              aria-label={tc("search")}
              className="h-9 pl-8 text-sm md:h-8 md:text-[13px]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:flex-1">
            {existingCategories.length > 0 && (
              <FilterPill
                label={t("categoryFilter")}
                options={existingCategories.map((c) => ({
                  value: c,
                  label: c,
                  count: (announcements ?? []).filter((a) => a.category === c).length,
                }))}
                selected={categoryFilter === ALL_CATEGORIES_VALUE ? [] : [categoryFilter]}
                // One category at a time: picking another replaces the current one.
                onChange={(next) =>
                  setCategoryFilter(next.find((c) => c !== categoryFilter) ?? ALL_CATEGORIES_VALUE)
                }
                clearLabel={t("clearFilter", { label: t("categoryFilter") })}
              />
            )}
            <div className="inline-flex rounded-lg border border-border/70 bg-muted/40 p-0.5">
              {(["newest", "reactions"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={sort === value}
                  onClick={() => setSort(value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    sort === value
                      ? "bg-card text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {value === "newest" ? t("sortNewest") : t("sortReactions")}
                </button>
              ))}
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="xs"
                className="ml-auto text-muted-foreground"
                onClick={() => void markAllRead({})}
              >
                <CheckCheck />
                {t("markAllRead")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {announcements && announcements.length === 0 && (
        <EmptyState
          icon={<Megaphone />}
          title={t("empty")}
          action={
            isManager ? (
              <Button data-shortcut-new size="sm" asChild>
                <Link href="/announcements/new">
                  <Plus />
                  {t("new")}
                </Link>
              </Button>
            ) : undefined
          }
        />
      )}
      {announcements && announcements.length > 0 && filtered.length === 0 && (
        <EmptyState
          icon={<Search />}
          title={tc("noResults")}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setCategoryFilter(ALL_CATEGORIES_VALUE);
              }}
            >
              {tc("clearSearch")}
            </Button>
          }
        />
      )}

      <div className="space-y-6">
        {pinnedRows.length > 0 && otherRows.length > 0 ? (
          <>
            <section className="space-y-0 divide-y divide-border/60">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("pinnedSection")}
              </h2>
              {pinnedRows.map(renderCard)}
            </section>
            <section className="space-y-0 divide-y divide-border/60">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("latestSection")}
              </h2>
              {otherRows.map(renderCard)}
            </section>
          </>
        ) : (
          <div className="space-y-0 divide-y divide-border/60">{filtered.map(renderCard)}</div>
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
