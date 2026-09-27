"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  ChevronRight,
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

import { RouteTabs } from "@/components/layout/RouteTabs";
import { useKnowledgeTabs } from "@/components/guidebooks/knowledge-tabs";
import {
  accessibleGuidebooks,
  guidebookDescription,
  guidebookTitle,
} from "@/components/guidebooks/registry";
import { CategoryManagerDialog, type WikiEntry } from "@/components/guidebooks/WikiEntryDialogs";
import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { OtherKnowledgeSources } from "@/components/guidebooks/other-sources";
import { Link } from "@/components/Link";
import { PersonPicker } from "@/components/people/PersonPicker";
import {
  isOwnerOrAdmin,
  useCurrentUser,
  useHasCapability,
} from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountTabs } from "@/components/ui/count-tabs";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { type FilterGroup, FilterPill, FilterSheet } from "@/components/ui/filter-pill";
import { Input } from "@/components/ui/input";
import { htmlToText } from "@/components/ui/rich-text";
import { useErrorHandler } from "@/hooks/use-error-handler";
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

const EMPTY_CATEGORIES: NonNullable<ReturnType<typeof useQuery<typeof api.wiki.categories.list>>> =
  [];

/** Unified shape for everything readable in the knowledge base, whichever of
 * the three backends it lives in: authored wiki entries, not-yet-migrated
 * block-editor pages, and the guides that ship as React components. A reader
 * is looking for a subject, not a storage layer, so they share one grid, one
 * search and one set of filters — only edit/delete/pin dispatch differently
 * underneath, and `editable` says which of those apply. */
interface GridItem {
  kind: "wiki" | "legacy" | "static";
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
  /** 0 for the component-backed guides, which have no edit history — they
   *  sort after dated entries rather than pretending to be brand new. */
  updatedAt: number;
  /** Component-backed guides are code, not content: they can be pinned but
   *  never edited or deleted from here. */
  editable: boolean;
  wikiEntry: WikiEntry | null;
}

/** An entry nobody has touched in half a year probably deserves a look. */
const STALE_AFTER_MS = 180 * 24 * 60 * 60 * 1000;

function useGridItems(user: ReturnType<typeof useCurrentUser>, t: (key: string) => string) {
  const entries = useQuery(api.wiki.entries.list);
  const legacyPages = useQuery(api.guidebooks.pages.list);
  const highlightedSlugs = useQuery(api.guidebooks.highlights.list);

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
      editable: true,
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
        editable: true,
        wikiEntry: null,
      }));

    // Guides that ship as components. They used to sit behind a collapsed
    // "Interactive tools & guides" drawer — 14 articles hidden under a label
    // that described the two tools beside them — and couldn't be searched or
    // filtered with everything else. Their registry `topic` maps onto the
    // same chips legacy pages already use, so one taxonomy covers all three.
    // Once a guide has moved into the wiki (same slug), its wiki entry above
    // stands in for it.
    const staticItems: GridItem[] = accessibleGuidebooks(user)
      .filter((gb) => gb.category === "guide" && !migratedSlugs.has(gb.slug))
      .map((gb) => ({
        kind: "static",
        key: `static:${gb.slug}`,
        slug: gb.slug,
        title: guidebookTitle(gb, t),
        snippet: guidebookDescription(gb, t),
        tags: [],
        categoryKey: gb.topic ? `topic:${gb.topic}` : "none",
        categoryLabel: gb.topic ? legacyTopicLabel(gb.topic) : "",
        categoryColor: gb.topic ? legacyTopicColor(gb.topic) : "#77808A",
        categoryDeleted: false,
        pinned: highlighted.has(gb.slug),
        version: null,
        archived: false,
        reviewDue: false,
        validUntil: null,
        authorUserId: "",
        ownerName: null,
        ownerAssigned: true,
        updatedAt: 0,
        editable: false,
        wikiEntry: null,
      }));

    return [...wikiItems, ...legacyItems, ...staticItems];
  }, [entries, legacyPages, highlightedSlugs, user, t]);
}

// --- Entry row ------------------------------------------------------------

function EntryRow({
  item,
  canManage,
  showCategory,
  onEdit,
}: {
  item: GridItem;
  canManage: boolean;
  /** Ungrouped listings (search results, archive) carry the category dot on
   *  the row itself, since there's no heading above it to say which it is. */
  showCategory?: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations("Guidebooks");
  const tc = useTranslations("Common");
  const user = useCurrentUser();
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const togglePin = useMutation(api.wiki.entries.togglePin);
  const toggleHighlight = useMutation(api.guidebooks.highlights.toggle);
  const removeEntry = useMutation(api.wiki.entries.remove);
  const removePage = useMutation(api.guidebooks.pages.remove);
  const color = item.archived ? "#77808A" : item.categoryColor;
  // Pinning is manager-curated (no ownership check, mirrors the server's
  // `togglePin`/`guidebookHighlights.toggle`); edit/delete require owning the
  // entry (or being admin) — showing those buttons more broadly would just
  // surface an action that fails server-side.
  const canEditThis = item.editable && canManage && isOwnerOrAdmin(user, item.authorUserId);

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

  // The category colour is carried by the group heading above, so a row only
  // shows it when it's standing on its own (search results, archive).
  const meta = [
    item.ownerName ? t("ownerLabel", { name: item.ownerName }) : null,
    item.version !== null ? t("versionMeta", { version: item.version }) : null,
    ...item.tags.slice(0, 3).map((tag) => `#${tag}`),
  ].filter(Boolean);

  return (
    <div className="group relative">
      <Link
        href={`/guidebooks/${item.slug}`}
        className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/60"
      >
        <div className="flex items-baseline gap-2 pr-16">
          {showCategory && (
            <span
              className="size-2 shrink-0 translate-y-[-1px] rounded-full"
              style={{ backgroundColor: color }}
              aria-hidden
            />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
          {item.reviewDue && !item.archived && (
            <Badge variant="warning" className="shrink-0">
              {t("reviewDueBadge")}
            </Badge>
          )}
          {!item.reviewDue &&
            !item.archived &&
            item.kind === "wiki" &&
            Date.now() - item.updatedAt > STALE_AFTER_MS && (
              <Badge variant="muted" className="shrink-0" title={t("staleHint")}>
                {t("staleBadge")}
              </Badge>
            )}
          {item.archived && !item.categoryDeleted && (
            <Badge variant="muted" className="shrink-0">
              {t("expiredBadge")}
            </Badge>
          )}
        </div>
        {item.snippet && (
          <p className="mt-0.5 truncate pr-16 text-[13px] text-muted-foreground">{item.snippet}</p>
        )}
        {meta.length > 0 && (
          <p className="mt-0.5 truncate pr-16 text-[11px] text-muted-foreground/80">
            {meta.join(" · ")}
          </p>
        )}
      </Link>
      <div className="absolute right-2 top-2 flex items-center gap-0.5">
        {canManage && !item.archived && (
          <button
            type="button"
            onClick={() => void onTogglePin()}
            aria-label={item.pinned ? t("unpinAction") : t("pinAction")}
            className={cn(
              "rounded-full p-1.5 transition-colors hover:bg-background",
              item.pinned
                ? "text-primary"
                : "text-muted-foreground/50 opacity-100 md:opacity-0 md:group-hover:opacity-100",
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
              className="rounded-full p-1.5 text-muted-foreground opacity-100 transition-opacity hover:bg-background hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void onDelete()}
              aria-label={tc("delete")}
              className="rounded-full p-1.5 text-muted-foreground opacity-100 transition-opacity hover:bg-background hover:text-destructive md:opacity-0 md:group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function GuidebooksPage() {
  const t = useTranslations("Guidebooks");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const user = useCurrentUser();
  const canManage = useHasCapability("manage_guidebooks");
  const handleError = useErrorHandler();

  const items = useGridItems(user, t);
  const knowledgeTabs = useKnowledgeTabs();
  const wikiCategoriesRaw = useQuery(api.wiki.categories.list);
  const wikiCategories = wikiCategoriesRaw ?? EMPTY_CATEGORIES;
  const extend = useMutation(api.wiki.entries.update);
  const setOwner = useMutation(api.wiki.entries.setOwner);
  const ensureDefaultCategories = useMutation(api.wiki.categories.ensureDefaults);

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
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);

  // Live tools, not articles — they operate rather than explain, so they sit
  // above the library as their own short row instead of being filed among the
  // documents (or hidden in a drawer with them). The ones big enough to have
  // earned a sidebar spot of their own aren't repeated here.
  const interactiveTools = useMemo(
    () =>
      accessibleGuidebooks(user).filter((gb) => gb.category === "interactive" && !gb.sidebarApp),
    [user],
  );

  // Every filterable category/topic in play: manageable wikiCategories plus
  // whichever topics are in use. Both the unmigrated block pages and the
  // component-backed guides file themselves under a topic, so this can't only
  // look at legacy pages — once they're all migrated there'd be no chip left
  // for the guides, and no chip means no group to render them in.
  const categoryChips = useMemo(() => {
    const chips = wikiCategories.map((c) => ({
      key: `cat:${c._id}`,
      label: c.name,
      color: c.color,
    }));
    const legacyTopics = new Set(
      (items ?? []).filter((i) => i.categoryKey.startsWith("topic:")).map((i) => i.categoryKey),
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

  // Component-backed guides carry no timestamp (updatedAt 0), so they tie on
  // the date comparison and fall back to alphabetical among themselves —
  // after the dated entries rather than jumbled through them.
  const sorted = useMemo(
    () =>
      [...filtered].sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          b.updatedAt - a.updatedAt ||
          a.title.localeCompare(b.title, "de"),
      ),
    [filtered],
  );

  // Subject headings, so the list reads as a library rather than a pile.
  // A search is already a filtered answer, so results stay flat — a heading
  // per hit would be noise, and the archive is small enough to leave alone.
  const groups = useMemo(() => {
    const flat = [{ key: "all", label: null, color: "", items: sorted }];
    if (search.trim() || showArchive || sorted.length === 0) return flat;

    const pinned = sorted.filter((i) => i.pinned);
    const byCategory = new Map<string, GridItem[]>();
    for (const item of sorted) {
      if (item.pinned) continue;
      const bucket = byCategory.get(item.categoryKey);
      if (bucket) bucket.push(item);
      else byCategory.set(item.categoryKey, [item]);
    }

    // Chips give the order; the buckets decide what's shown. Anything without
    // a chip (a category that was deleted out from under its entries) still
    // gets a heading of its own rather than disappearing from the list.
    const chipOrder = new Map(categoryChips.map((chip, index) => [chip.key, index]));
    const categorized = [...byCategory.entries()]
      .filter(([key]) => key !== "none")
      .sort(
        ([a], [b]) =>
          (chipOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
            (chipOrder.get(b) ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b),
      )
      .map(([key, group]) => {
        const chip = categoryChips.find((c) => c.key === key);
        return {
          key,
          label: chip?.label || group[0].categoryLabel || t("uncategorizedGroup"),
          color: chip?.color ?? group[0].categoryColor,
          items: group,
        };
      });

    return [
      ...(pinned.length > 0
        ? [{ key: "pinned", label: t("pinnedGroup"), color: "#77808A", items: pinned }]
        : []),
      ...categorized,
      ...(byCategory.has("none")
        ? [
            {
              key: "none",
              label: t("uncategorizedGroup"),
              color: "#77808A",
              items: byCategory.get("none")!,
            },
          ]
        : []),
    ];
  }, [sorted, search, showArchive, categoryChips, t]);

  const availableTags = useMemo(() => {
    const pool = (items ?? []).filter((i) => (showArchive ? i.archived : !i.archived));
    return [...new Set(pool.flatMap((i) => i.tags))].sort((a, b) => a.localeCompare(b, "de"));
  }, [items, showArchive]);

  // One definition, two renderings: pills on desktop, a sheet on a phone.
  const filterGroups: FilterGroup[] = useMemo(() => {
    const result: FilterGroup[] = [];
    if (!showArchive && categoryChips.length > 0) {
      result.push({
        key: "category",
        label: t("fieldCategory"),
        options: categoryChips.map((c) => ({
          value: c.key,
          label: c.label,
          count: (items ?? []).filter((i) => !i.archived && i.categoryKey === c.key).length,
          leading: (
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
          ),
        })),
        selected: [...activeCategoryKeys],
        onChange: (next) => setActiveCategoryKeys(new Set(next)),
      });
    }
    if (availableTags.length > 0) {
      result.push({
        key: "tags",
        label: t("tagsFilterLabel"),
        options: availableTags.map((tag) => ({ value: tag, label: `#${tag}` })),
        selected: [...activeTags],
        onChange: (next) => setActiveTags(new Set(next)),
      });
    }
    return result;
  }, [showArchive, categoryChips, items, activeCategoryKeys, availableTags, activeTags, t]);

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
        policy: item.wikiEntry.policy || undefined,
        minRole: item.wikiEntry.minRole ?? undefined,
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
      {/* Files used to be a third header action competing for the fixed slot
          (and, on a phone, a third unlabelled icon in the thumb pill). It's a
          view of this same section, so it's a tab now — leaving "new entry"
          as the one primary action. */}
      <PageHeaderActions
        actions={
          canManage
            ? [
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
      <RouteTabs tabs={knowledgeTabs} activeValue="library" />

      {interactiveTools.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-xs text-muted-foreground font-medium normal-case tracking-normal">
            {t("interactiveToolsTitle")}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
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
        </div>
      )}

      <OtherKnowledgeSources />

      <div className="space-y-4">
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
            {/* Pills on a wide screen, one sheet on a phone — two small
                popover targets stacked above the list is the worst of both. */}
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              {filterGroups.map((group) => (
                <FilterPill
                  key={group.key}
                  label={group.label}
                  options={group.options}
                  selected={group.selected}
                  onChange={group.onChange}
                  clearLabel={t("clearFilter", { label: group.label })}
                />
              ))}
            </div>
            {filterGroups.length > 0 && (
              <FilterSheet
                className="md:hidden"
                groups={filterGroups}
                label={t("filtersLabel")}
                clearLabel={tc("clearAll")}
              />
            )}
          </div>
        </div>

        {!showArchive && reviewDue.length > 0 && (
          <div className="border p-4 rounded-xl border-border/70 border-l-2 border-l-warn bg-card">
            <p className="mb-1 text-sm font-semibold text-warn">{t("reviewPanelTitle")}</p>
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
                    <span className="text-xs font-medium text-warn">
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
          <div className="border p-4 rounded-xl border-border/70 border-l-2 border-l-info bg-card">
            <p className="mb-1 text-sm font-semibold text-info">{t("ownershipPanelTitle")}</p>
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
                  <PersonPicker
                    value={null}
                    onChange={(ownerUserId) =>
                      ownerUserId &&
                      setOwner({ entryId: item.wikiEntry!._id, ownerUserId }).catch(handleError)
                    }
                    label={t("ownerMissing")}
                    placeholder={t("ownerMissing")}
                    align="end"
                    className="h-7 min-h-7 w-44 bg-card text-xs md:min-h-7"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {items === undefined ? null : sorted.length === 0 ? (
          <EmptyState
            icon={showArchive ? <Archive /> : <Sparkles />}
            title={showArchive ? t("archiveEmpty") : t("noResults")}
            action={
              search ? (
                <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                  {tc("clearSearch")}
                </Button>
              ) : canManage && !showArchive ? (
                <Button data-shortcut-new size="sm" asChild>
                  <Link href="/guidebooks/new">
                    <Plus />
                    {t("newEntry")}
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="-mx-3 divide-y divide-border/50">
            {groups.map((group) => (
              <div key={group.key} className="py-2 first:pt-0">
                {group.label && (
                  <p className="flex items-center gap-2 px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: group.color }}
                      aria-hidden
                    />
                    {group.label}
                    <span className="tabular-nums text-muted-foreground/60">
                      {group.items.length}
                    </span>
                  </p>
                )}
                {group.items.map((i) => (
                  <EntryRow
                    key={i.key}
                    item={i}
                    canManage={canManage}
                    showCategory={!group.label}
                    onEdit={() => {
                      if (i.kind === "wiki" && i.wikiEntry) {
                        router.push(`/guidebooks/${i.wikiEntry.slug}/compose`);
                      } else router.push(`/guidebooks/${i.slug}/edit`);
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <CategoryManagerDialog open={categoryManagerOpen} onOpenChange={setCategoryManagerOpen} />
    </div>
  );
}
