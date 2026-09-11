"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  ChevronRight,
  FileText,
  FolderOpen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { accessibleGuidebooks, guidebookTitle } from "@/components/guidebooks/registry";
import { CategoryManagerDialog, type WikiEntry } from "@/components/guidebooks/WikiEntryDialogs";
import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { Link } from "@/components/Link";
import {
  isOwnerOrAdmin,
  useCurrentUser,
  useHasCapability,
} from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CountTabs } from "@/components/ui/count-tabs";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterPill } from "@/components/ui/filter-pill";
import { Input } from "@/components/ui/input";
import { htmlToText } from "@/components/ui/rich-text";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useDesignPreview } from "@/lib/design-preview";
import { formatIsoDate } from "@/lib/format";
import {
  addMonths,
  daysUntil,
  inArchive,
  legacyTopicColor,
  legacyTopicLabel,
  msToDateInput,
  needsReview,
} from "@/lib/wiki";
import { cn } from "@/lib/utils";

const EMPTY_CATEGORIES: NonNullable<ReturnType<typeof useQuery<typeof api.wikiCategories.list>>> =
  [];

/** Unified shape for both wiki-v2 entries and legacy (block-editor)
 * guidebook pages, so the grid, filters, search and sort treat them the
 * same — only edit/delete/pin dispatch differently underneath. */
interface GridItem {
  kind: "wiki" | "legacy";
  key: string;
  slug: string;
  title: string;
  snippet: string;
  tags: string[];
  categoryKey: string;
  categoryLabel: string;
  categoryColor: string;
  categoryDeleted: boolean;
  pinned: boolean;
  version: number | null;
  archived: boolean;
  reviewDue: boolean;
  validUntil: number | null;
  authorUserId: string;
  ownerName: string | null;
  ownerAssigned: boolean;
  updatedAt: number;
  wikiEntry: WikiEntry | null;
}

function useGridItems() {
  const entries = useQuery(api.wikiEntries.list);
  const legacyPages = useQuery(api.guidebookPages.list);
  const highlightedSlugs = useQuery(api.guidebookHighlights.list);

  return useMemo(() => {
    if (entries === undefined || legacyPages === undefined || highlightedSlugs === undefined) {
      return undefined;
    }
    const migratedSlugs = new Set(entries.map((e) => e.slug));
    const highlighted = new Set(highlightedSlugs);

    const wikiItems: GridItem[] = entries.map((e) => ({
      kind: "wiki",
      key: e._id,
      slug: e.slug,
      title: e.thema,
      snippet: htmlToText(e.erklaerung),
      tags: e.tags,
      categoryKey: e.categoryId ? `cat:${e.categoryId}` : "none",
      categoryLabel: e.categoryName ?? "",
      categoryColor: e.categoryColor ?? "#77808A",
      categoryDeleted: e.categoryDeleted,
      pinned: e.pinned,
      version: e.version,
      archived: inArchive(e),
      reviewDue: !inArchive(e) && needsReview(e),
      validUntil: e.validUntil,
      authorUserId: e.authorUserId,
      ownerName: e.ownerName,
      ownerAssigned: e.ownerAssigned,
      updatedAt: e.updatedAt,
      wikiEntry: e,
    }));

    // Pages already migrated (a wikiEntries row shares their slug) are
    // superseded — showing both would just be a duplicate.
    const legacyItems: GridItem[] = legacyPages
      .filter((p) => !migratedSlugs.has(p.slug))
      .map((p) => ({
        kind: "legacy",
        key: p._id,
        slug: p.slug,
        title: p.title,
        snippet: p.description,
        tags: [],
        categoryKey: `topic:${p.topic}`,
        categoryLabel: legacyTopicLabel(p.topic),
        categoryColor: legacyTopicColor(p.topic),
        categoryDeleted: false,
        pinned: highlighted.has(p.slug),
        version: null,
        archived: false,
        reviewDue: false,
        validUntil: null,
        authorUserId: p.authorUserId,
        ownerName: null,
        ownerAssigned: true,
        updatedAt: p.updatedAt,
        wikiEntry: null,
      }));

    return [...wikiItems, ...legacyItems];
  }, [entries, legacyPages, highlightedSlugs]);
}

// --- Entry card -----------------------------------------------------------

function EntryCard({
  item,
  canManage,
  onEdit,
}: {
  item: GridItem;
  canManage: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations("Guidebooks");
  const tc = useTranslations("Common");
  const user = useCurrentUser();
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const togglePin = useMutation(api.wikiEntries.togglePin);
  const toggleHighlight = useMutation(api.guidebookHighlights.toggle);
  const removeEntry = useMutation(api.wikiEntries.remove);
  const removePage = useMutation(api.guidebookPages.remove);
  const color = item.archived ? "#77808A" : item.categoryColor;
  // Pinning is manager-curated (no ownership check, mirrors the server's
  // `togglePin`/`guidebookHighlights.toggle`); edit/delete require owning the
  // entry (or being admin) — showing those buttons more broadly would just
  // surface an action that fails server-side.
  const canEditThis = canManage && isOwnerOrAdmin(user, item.authorUserId);

  async function onTogglePin() {
    try {
      if (item.kind === "wiki") await togglePin({ entryId: item.wikiEntry!._id });
      else await toggleHighlight({ slug: item.slug });
    } catch (e) {
      handleError(e);
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: t("deleteEntryConfirm"),
      description: tc("deleteWarning"),
      details: [
        { label: t("fieldThema"), value: item.title },
        ...(item.categoryDeleted ? [] : [{ label: t("fieldCategory"), value: item.categoryLabel }]),
        ...(item.version === null
          ? []
          : [
              {
                label: t("versionMeta", { version: item.version }),
                value: item.wikiEntry?.authorName ?? "",
              },
            ]),
      ],
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      if (item.kind === "wiki") await removeEntry({ entryId: item.wikiEntry!._id });
      else await removePage({ pageId: item.key as Id<"guidebookPages"> });
    } catch (err) {
      handleError(err);
    }
  }

  return (
    <Card
      className="group relative h-full overflow-hidden transition-shadow hover:shadow-md refreshed:transition-colors refreshed:hover:border-foreground/20 refreshed:hover:shadow-none"
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <Link href={`/guidebooks/${item.slug}`} className="block h-full">
        <CardContent className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p
                className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider refreshed:font-medium refreshed:normal-case refreshed:tracking-normal"
                style={{ color }}
              >
                {item.kind === "legacy" && <FileText className="size-3" />}
                {item.archived ? t("archiveChip") : item.categoryLabel}
                {item.archived && item.categoryLabel && (
                  <span className="ml-1 font-normal normal-case text-muted-foreground">
                    · {t("wasCategory", { name: item.categoryLabel })}
                  </span>
                )}
              </p>
              <p className="font-display font-semibold tracking-tight">{item.title}</p>
            </div>
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">{item.snippet}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {item.tags.map((tag) => (
              <Badge key={tag} variant="muted" className="font-normal">
                #{tag}
              </Badge>
            ))}
            {item.reviewDue && !item.archived && (
              <Badge variant="warning">{t("reviewDueBadge")}</Badge>
            )}
            {item.archived && !item.categoryDeleted && (
              <Badge variant="muted">{t("expiredBadge")}</Badge>
            )}
          </div>
          {item.version !== null && (
            <p className="text-xs text-muted-foreground">
              {t("versionMeta", { version: item.version })}
            </p>
          )}
          {item.ownerName && (
            <p className="text-xs text-muted-foreground">
              {t("ownerLabel", { name: item.ownerName })}
            </p>
          )}
        </CardContent>
      </Link>
      <div className="absolute right-2 top-2 flex items-center gap-0.5">
        {canManage && !item.archived && (
          <button
            type="button"
            onClick={() => void onTogglePin()}
            aria-label={item.pinned ? t("unpinAction") : t("pinAction")}
            className={cn(
              "rounded-full p-1.5 transition-colors hover:bg-accent",
              item.pinned ? "text-primary" : "text-muted-foreground/50",
            )}
          >
            {item.pinned ? <Pin className="size-4" /> : <PinOff className="size-4" />}
          </button>
        )}
        {canEditThis && (
          <>
            <button
              type="button"
              onClick={onEdit}
              aria-label={tc("edit")}
              className="rounded-full p-1.5 text-muted-foreground opacity-100 transition-opacity hover:bg-accent hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void onDelete()}
              aria-label={tc("delete")}
              className="rounded-full p-1.5 text-muted-foreground opacity-100 transition-opacity hover:bg-accent hover:text-destructive md:opacity-0 md:group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </Card>
  );
}

export default function GuidebooksPage() {
  const t = useTranslations("Guidebooks");
  const locale = useLocale();
  const router = useRouter();
  const user = useCurrentUser();
  const canManage = useHasCapability("manage_guidebooks");
  const handleError = useErrorHandler();
  const design = useDesignPreview();

  const items = useGridItems();
  const users = useQuery(api.users.list, {}) ?? [];
  const wikiCategoriesRaw = useQuery(api.wikiCategories.list);
  const wikiCategories = wikiCategoriesRaw ?? EMPTY_CATEGORIES;
  const extend = useMutation(api.wikiEntries.update);
  const setOwner = useMutation(api.wikiEntries.setOwner);
  const ensureDefaultCategories = useMutation(api.wikiCategories.ensureDefaults);

  // Seed the prototype's default categories the first time anyone loads the
  // wiki with none yet — mirrors the original app's own lazy bootstrap
  // rather than requiring a manager to notice and create them by hand.
  useEffect(() => {
    if (wikiCategoriesRaw?.length === 0) void ensureDefaultCategories({});
  }, [wikiCategoriesRaw, ensureDefaultCategories]);

  const [search, setSearch] = useState("");
  const [activeCategoryKeys, setActiveCategoryKeys] = useState<Set<string>>(new Set());
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [showArchive, setShowArchive] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  const interactiveTools = useMemo(() => accessibleGuidebooks(user), [user]);

  // Every filterable category/topic in play: manageable wikiCategories plus
  // whichever legacy topics still have unmigrated pages — always visible,
  // not gated on migration.
  const categoryChips = useMemo(() => {
    const chips = wikiCategories.map((c) => ({
      key: `cat:${c._id}`,
      label: c.name,
      color: c.color,
    }));
    const legacyTopics = new Set(
      (items ?? []).filter((i) => i.kind === "legacy").map((i) => i.categoryKey),
    );
    for (const key of legacyTopics) {
      const topic = key.slice("topic:".length);
      chips.push({ key, label: legacyTopicLabel(topic), color: legacyTopicColor(topic) });
    }
    return chips;
  }, [wikiCategories, items]);

  const reviewDue = useMemo(
    () =>
      (items ?? [])
        .filter((i) => i.kind === "wiki" && i.reviewDue)
        .sort((a, b) => (a.validUntil ?? 0) - (b.validUntil ?? 0)),
    [items],
  );
  const ownershipMissing = useMemo(
    () =>
      (items ?? [])
        .filter((item) => item.kind === "wiki" && !item.archived && !item.ownerAssigned)
        .sort((a, b) => a.updatedAt - b.updatedAt),
    [items],
  );

  const filtered = useMemo(() => {
    if (!items) return [];
    const query = search.trim().toLowerCase();
    return items.filter((i) => {
      if (showArchive) {
        if (!i.archived) return false;
      } else {
        if (i.archived) return false;
        if (activeCategoryKeys.size && !activeCategoryKeys.has(i.categoryKey)) return false;
      }
      if (activeTags.size && ![...activeTags].every((tag) => i.tags.includes(tag))) return false;
      if (query) {
        const haystack =
          `${i.title} ${i.snippet} ${i.tags.join(" ")} ${i.categoryLabel}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [items, showArchive, activeCategoryKeys, activeTags, search]);

  const sorted = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
      ),
    [filtered],
  );

  const availableTags = useMemo(() => {
    const pool = (items ?? []).filter((i) => (showArchive ? i.archived : !i.archived));
    return [...new Set(pool.flatMap((i) => i.tags))].sort((a, b) => a.localeCompare(b, "de"));
  }, [items, showArchive]);
  // Legacy (block-editor) pages render in their own collapsed section rather
  // than interleaved with wiki entries — see the grid below.
  const currentEntries = useMemo(() => sorted.filter((i) => i.kind !== "legacy"), [sorted]);
  const legacyEntries = useMemo(() => sorted.filter((i) => i.kind === "legacy"), [sorted]);

  function toggleCategory(key: string) {
    setActiveCategoryKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleTag(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  async function onExtend(item: GridItem) {
    if (!item.wikiEntry) return;
    try {
      await extend({
        entryId: item.wikiEntry._id,
        categoryId: item.wikiEntry.categoryId ?? undefined,
        thema: item.wikiEntry.thema,
        erklaerung: item.wikiEntry.erklaerung,
        tags: item.wikiEntry.tags,
        link: item.wikiEntry.link ?? undefined,
        validFrom: item.wikiEntry.validFrom,
        validUntil: addMonths(Date.now(), 3),
      });
      toast.success(t("extended"));
    } catch (e) {
      handleError(e);
    }
  }

  return (
    <div className="mx-auto max-w-5xl" data-tour="tour-guidebooks-list">
      <PageHeaderBar title={t("title")} description={t("subtitle")} tourCheckpoint="guidebooks" />
      {/* Manage categories + new entry are the two primary actions and move
          into the header/bottom-nav pill; "Browse files" is a shortcut to a
          different tool entirely, not a page action, so it stays a plain
          in-page link instead of crowding that fixed slot with a third
          icon. */}
      <PageHeaderActions
        actions={
          canManage
            ? [
                {
                  key: "browse-files",
                  label: t("browseFiles"),
                  icon: FolderOpen,
                  onClick: () => router.push("/guidebooks/files"),
                  variant: "outline" as const,
                },
                {
                  key: "categories",
                  label: t("categoryManagerTitle"),
                  icon: Settings2,
                  onClick: () => setCategoryManagerOpen(true),
                  variant: "outline" as const,
                },
                {
                  key: "new-entry",
                  label: t("newEntry"),
                  icon: Plus,
                  onClick: () => router.push("/guidebooks/new"),
                },
              ]
            : []
        }
      />

      {/* The header already carries "Browse files"; the refreshed design
          doesn't repeat it in the page. */}
      {canManage && design !== "refreshed" && (
        <div className="mb-4 flex justify-end">
          <Button variant="outline" size="sm" asChild>
            <Link href="/guidebooks/files">
              <FolderOpen className="size-4" />
              {t("browseFiles")}
            </Link>
          </Button>
        </div>
      )}

      {interactiveTools.length > 0 && (
        <details
          className="group mb-6"
          open={toolsOpen}
          onToggle={(e) => setToolsOpen(e.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground refreshed:font-medium refreshed:normal-case refreshed:tracking-normal">
            <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
            <Sparkles className="size-3.5" />
            {t("interactiveToolsTitle")}
            <span className="tabular-nums">· {interactiveTools.length}</span>
          </summary>
          {/* Fifteen full-width rows is most of a phone screen, so opening
              this pushed the actual wiki entries out of view. Capped and
              scrolled instead — single column on mobile so the longer
              titles stay readable rather than truncating to nothing. */}
          <div className="mt-2 grid max-h-72 gap-2 overflow-y-auto overscroll-contain pr-1 sm:max-h-none sm:grid-cols-2 sm:overflow-visible sm:pr-0">
            {interactiveTools.map((gb) => (
              <Link
                key={gb.slug}
                href={`/guidebooks/${gb.slug}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 transition-colors hover:bg-accent"
              >
                <gb.icon className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {guidebookTitle(gb, t)}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </details>
      )}

      <div className="space-y-4">
        {design === "refreshed" ? (
          <div>
            <CountTabs
              value={showArchive ? "archive" : "current"}
              onChange={(value) => setShowArchive(value === "archive")}
              tabs={[
                {
                  value: "current",
                  label: t("currentTab"),
                  count: (items ?? []).filter((i) => !i.archived).length,
                },
                {
                  value: "archive",
                  label: t("archiveChip"),
                  count: (items ?? []).filter((i) => i.archived).length,
                },
              ]}
            />
            <div className="flex flex-col gap-2 pt-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  aria-label={t("searchPlaceholder")}
                  className="h-9 pl-8 text-sm md:h-8 md:text-[13px]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!showArchive && categoryChips.length > 0 && (
                  <FilterPill
                    label={t("fieldCategory")}
                    options={categoryChips.map((c) => ({
                      value: c.key,
                      label: c.label,
                      count: (items ?? []).filter((i) => !i.archived && i.categoryKey === c.key)
                        .length,
                      leading: (
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                      ),
                    }))}
                    selected={[...activeCategoryKeys]}
                    onChange={(next) => setActiveCategoryKeys(new Set(next))}
                    clearLabel={t("clearFilter", { label: t("fieldCategory") })}
                  />
                )}
                {availableTags.length > 0 && (
                  <FilterPill
                    label={t("tagsFilterLabel")}
                    options={availableTags.map((tag) => ({ value: tag, label: `#${tag}` }))}
                    selected={[...activeTags]}
                    onChange={(next) => setActiveTags(new Set(next))}
                    clearLabel={t("clearFilter", { label: t("tagsFilterLabel") })}
                  />
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="pl-9"
              />
            </div>
            <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categoryChips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  disabled={showArchive}
                  onClick={() => toggleCategory(c.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                    activeCategoryKeys.has(c.key) && !showArchive
                      ? "border-transparent text-white"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                  style={
                    activeCategoryKeys.has(c.key) && !showArchive
                      ? { backgroundColor: c.color }
                      : undefined
                  }
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="whitespace-nowrap">{c.label}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowArchive((v) => !v)}
                className={cn(
                  "ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  showArchive
                    ? "border-muted-foreground/40 bg-muted-foreground/10 text-foreground"
                    : "border-dashed border-border text-muted-foreground hover:bg-accent",
                )}
              >
                <Archive className="size-3.5" />
                {t("archiveChip")}
              </button>
            </div>
            {availableTags.length > 0 && (
              <div className="mt-2.5 border-t border-dashed border-border pt-2.5">
                {/* Every tag as a permanent chip buried the actual entries on a
                  phone — this list runs to twenty-plus. Collapsed by default;
                  whatever is currently filtering stays visible either way. */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTagsOpen((v) => !v)}
                    aria-expanded={tagsOpen}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
                  >
                    <ChevronRight
                      className={cn("size-3 transition-transform", tagsOpen && "rotate-90")}
                    />
                    {t("tagsFilterLabel")}
                    <span className="tabular-nums">{availableTags.length}</span>
                  </button>
                  {!tagsOpen &&
                    [...activeTags].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className="rounded-full border border-foreground bg-foreground px-2.5 py-1 text-xs font-medium text-background"
                      >
                        #{tag}
                      </button>
                    ))}
                </div>
                {tagsOpen && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {availableTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                          activeTags.has(tag)
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-muted-foreground hover:bg-accent",
                        )}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!showArchive && reviewDue.length > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 refreshed:rounded-xl refreshed:border-border/70 refreshed:border-l-2 refreshed:border-l-warn refreshed:bg-card">
            <p className="mb-1 text-sm font-semibold text-amber-700 dark:text-amber-400 refreshed:text-warn">
              {t("reviewPanelTitle")}
            </p>
            <p className="mb-3 text-xs text-muted-foreground">{t("reviewPanelBody")}</p>
            <div className="space-y-2">
              {reviewDue.map((i) => {
                const days = daysUntil(i.validUntil ?? 0);
                return (
                  <div
                    key={i.key}
                    className="flex flex-wrap items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{i.title}</span>
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-400 refreshed:text-warn">
                      {days < 0
                        ? t("expiredSince", {
                            date: formatIsoDate(msToDateInput(i.validUntil ?? 0), locale),
                          })
                        : t("expiresInDays", { count: days })}
                    </span>
                    {canManage && (
                      <Button size="sm" variant="outline" onClick={() => void onExtend(i)}>
                        {t("extendBy3Months")}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {canManage && !showArchive && ownershipMissing.length > 0 && (
          <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4 refreshed:rounded-xl refreshed:border-border/70 refreshed:border-l-2 refreshed:border-l-info refreshed:bg-card">
            <p className="mb-1 text-sm font-semibold text-sky-700 dark:text-sky-300 refreshed:text-info">
              {t("ownershipPanelTitle")}
            </p>
            <p className="mb-3 text-xs text-muted-foreground">{t("ownershipPanelBody")}</p>
            <div className="space-y-2">
              {ownershipMissing.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center gap-3 rounded-lg bg-card px-3 py-2 text-sm"
                >
                  <Link
                    href={`/guidebooks/${item.slug}`}
                    className="min-w-0 flex-1 truncate font-medium transition-colors hover:text-primary"
                  >
                    {item.title}
                  </Link>
                  <Select
                    onValueChange={(ownerUserId) =>
                      setOwner({
                        entryId: item.wikiEntry!._id,
                        ownerUserId: ownerUserId as Id<"users">,
                      }).catch(handleError)
                    }
                  >
                    <SelectTrigger className="h-7 w-44 bg-card text-xs">
                      <SelectValue placeholder={t("ownerMissing")} />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user._id} value={user._id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {items === undefined ? null : sorted.length === 0 ? (
          <EmptyState
            icon={showArchive ? <Archive /> : <Sparkles />}
            title={showArchive ? t("archiveEmpty") : t("noResults")}
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {currentEntries.map((i) => (
                <EntryCard
                  key={i.key}
                  item={i}
                  canManage={canManage}
                  onEdit={() => {
                    if (i.kind === "wiki" && i.wikiEntry) {
                      router.push(`/guidebooks/${i.wikiEntry.slug}/compose`);
                    } else router.push(`/guidebooks/${i.slug}/edit`);
                  }}
                />
              ))}
            </div>

            {/* Not-yet-migrated block-editor pages. They outnumbered the real
                entries in the shared grid and pushed them off the first
                screen, so they get their own collapsed section — still
                searchable and filterable, just not competing for attention. */}
            {legacyEntries.length > 0 && (
              <details className="group mt-4">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground refreshed:font-medium refreshed:normal-case refreshed:tracking-normal">
                  <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                  <FileText className="size-3.5" />
                  {t("legacySectionTitle")}
                  <span className="tabular-nums">· {legacyEntries.length}</span>
                </summary>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {legacyEntries.map((i) => (
                    <EntryCard
                      key={i.key}
                      item={i}
                      canManage={canManage}
                      onEdit={() => router.push(`/guidebooks/${i.slug}/edit`)}
                    />
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>

      <CategoryManagerDialog open={categoryManagerOpen} onOpenChange={setCategoryManagerOpen} />
    </div>
  );
}
