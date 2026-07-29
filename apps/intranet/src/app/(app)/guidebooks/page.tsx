"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  ChevronRight,
  Lock,
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
import {
  CategoryManagerDialog,
  EntryDialog,
  type WikiEntry,
} from "@/components/guidebooks/WikiEntryDialogs";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import {
  isOwnerOrAdmin,
  useCurrentUser,
  useHasCapability,
  useIsManager,
} from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";
import { addMonths, daysUntil, inArchive, msToDateInput, needsReview } from "@/lib/wiki";
import { cn } from "@/lib/utils";

type Entry = WikiEntry;
type Category = NonNullable<ReturnType<typeof useQuery<typeof api.wikiCategories.list>>>[number];

// --- Migration lock screen ---------------------------------------------------

function MigrationGate() {
  const t = useTranslations("Guidebooks");
  const isManager = useIsManager();
  const handleError = useErrorHandler();
  const run = useMutation(api.wikiMigration.run);
  const [busy, setBusy] = useState(false);

  async function onMigrate() {
    setBusy(true);
    try {
      const res = await run({});
      toast.success(t("migrationDone", { count: res.migratedCount }));
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Lock className="size-6" />
      </span>
      <h1 className="font-display text-xl font-bold tracking-tight">{t("migrationTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("migrationBody")}</p>
      {isManager ? (
        <Button className="mt-2" onClick={() => void onMigrate()} disabled={busy}>
          {t("migrationCta")}
        </Button>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{t("migrationWaitingBody")}</p>
      )}
    </div>
  );
}

// --- Entry card -----------------------------------------------------------

function EntryCard({
  entry,
  canManage,
  onEdit,
}: {
  entry: Entry;
  canManage: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations("Guidebooks");
  const tc = useTranslations("Common");
  const user = useCurrentUser();
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const togglePin = useMutation(api.wikiEntries.togglePin);
  const remove = useMutation(api.wikiEntries.remove);
  const archived = inArchive(entry);
  const review = !archived && needsReview(entry);
  const color = archived ? "#77808A" : (entry.categoryColor ?? "#77808A");
  // Pinning is manager-curated (no ownership check, mirrors the server's
  // `togglePin`); edit/delete require owning the entry (or being admin),
  // mirroring `update`/`remove` — showing those buttons more broadly would
  // just surface an action that fails server-side.
  const canEditThis = canManage && isOwnerOrAdmin(user, entry.authorUserId);

  async function onDelete(e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await confirm({
      title: t("deleteEntryConfirm"),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove({ entryId: entry._id });
    } catch (err) {
      handleError(err);
    }
  }

  return (
    <Card
      className="group relative h-full overflow-hidden transition-shadow hover:shadow-md"
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <Link href={`/guidebooks/${entry.slug}`} className="block h-full">
        <CardContent className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>
                {archived ? t("archiveChip") : (entry.categoryName ?? "")}
                {archived && entry.categoryName && (
                  <span className="ml-1 font-normal normal-case text-muted-foreground">
                    · {t("wasCategory", { name: entry.categoryName })}
                  </span>
                )}
              </p>
              <p className="font-display font-semibold tracking-tight">{entry.thema}</p>
            </div>
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">{entry.erklaerung}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {entry.tags.map((tag) => (
              <Badge key={tag} variant="muted" className="font-normal">
                #{tag}
              </Badge>
            ))}
            {review && !archived && <Badge variant="warning">{t("reviewDueBadge")}</Badge>}
            {archived && !entry.categoryDeleted && (
              <Badge variant="muted">{t("expiredBadge")}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("versionMeta", { version: entry.version })}
          </p>
        </CardContent>
      </Link>
      <div className="absolute right-2 top-2 flex items-center gap-0.5">
        {canManage && !archived && (
          <button
            type="button"
            onClick={() => void togglePin({ entryId: entry._id }).catch(handleError)}
            aria-label={entry.pinned ? t("unpinAction") : t("pinAction")}
            className={cn(
              "rounded-full p-1.5 transition-colors hover:bg-accent",
              entry.pinned ? "text-primary" : "text-muted-foreground/50",
            )}
          >
            {entry.pinned ? <Pin className="size-4" /> : <PinOff className="size-4" />}
          </button>
        )}
        {canEditThis && (
          <>
            <button
              type="button"
              onClick={onEdit}
              aria-label={tc("edit")}
              className="rounded-full p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => void onDelete(e)}
              aria-label={tc("delete")}
              className="rounded-full p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </Card>
  );
}

// --- Main page ------------------------------------------------------------

export default function GuidebooksPage() {
  const t = useTranslations("Guidebooks");
  const locale = useLocale();
  const user = useCurrentUser();
  const canManage = useHasCapability("manage_guidebooks");
  const handleError = useErrorHandler();

  const migrationStatus = useQuery(api.wikiMigration.status);
  const entries = useQuery(api.wikiEntries.list);
  const categories = useQuery(api.wikiCategories.list) ?? [];
  const extend = useMutation(api.wikiEntries.update);

  const [search, setSearch] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [showArchive, setShowArchive] = useState(false);
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);

  const interactiveTools = useMemo(() => accessibleGuidebooks(user), [user]);

  const reviewDue = useMemo(
    () =>
      (entries ?? [])
        .filter((e) => needsReview(e) && !e.categoryDeleted)
        .sort((a, b) => a.validUntil - b.validUntil),
    [entries],
  );

  const filtered = useMemo(() => {
    if (!entries) return [];
    const query = search.trim().toLowerCase();
    return entries.filter((e) => {
      const archived = inArchive(e);
      if (showArchive) {
        if (!archived) return false;
      } else {
        if (archived) return false;
        if (activeCategories.size && !(e.categoryId && activeCategories.has(e.categoryId)))
          return false;
      }
      if (activeTags.size && ![...activeTags].every((tag) => e.tags.includes(tag))) return false;
      if (query) {
        const haystack =
          `${e.thema} ${e.erklaerung} ${e.tags.join(" ")} ${e.categoryName ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [entries, showArchive, activeCategories, activeTags, search]);

  const sorted = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
      ),
    [filtered],
  );

  const availableTags = useMemo(() => {
    const pool = (entries ?? []).filter((e) => (showArchive ? inArchive(e) : !inArchive(e)));
    return [...new Set(pool.flatMap((e) => e.tags))].sort((a, b) => a.localeCompare(b, "de"));
  }, [entries, showArchive]);

  function toggleCategory(id: string) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  async function onExtend(entry: Entry) {
    try {
      await extend({
        entryId: entry._id,
        categoryId: entry.categoryId ?? undefined,
        thema: entry.thema,
        erklaerung: entry.erklaerung,
        tags: entry.tags,
        link: entry.link ?? undefined,
        validFrom: entry.validFrom,
        validUntil: addMonths(Date.now(), 3),
      });
      toast.success(t("extended"));
    } catch (e) {
      handleError(e);
    }
  }

  if (migrationStatus === undefined) return null;
  if (migrationStatus === null) return <MigrationGate />;

  return (
    <div className="mx-auto max-w-5xl" data-tour="tour-guidebooks-list">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("subtitle")}
        tourCheckpoint="guidebooks"
        action={
          canManage ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setCategoryManagerOpen(true)}>
                <Settings2 className="size-4" />
              </Button>
              <Button onClick={() => setEditing("new")}>
                <Plus className="mr-2 size-4" />
                {t("newEntry")}
              </Button>
            </div>
          ) : undefined
        }
      />

      {interactiveTools.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="size-3.5" />
            {t("interactiveToolsTitle")}
          </div>
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

      <div className="space-y-4">
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
          <div className="flex flex-wrap items-center gap-1.5">
            {categories.map((c: Category) => (
              <button
                key={c._id}
                type="button"
                disabled={showArchive}
                onClick={() => toggleCategory(c._id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                  activeCategories.has(c._id) && !showArchive
                    ? "border-transparent text-white"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
                style={
                  activeCategories.has(c._id) && !showArchive
                    ? { backgroundColor: c.color }
                    : undefined
                }
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: c.color }} />
                {c.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowArchive((v) => !v)}
              className={cn(
                "ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
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
            <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-dashed border-border pt-2.5">
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

        {!showArchive && reviewDue.length > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="mb-1 text-sm font-semibold text-amber-700 dark:text-amber-400">
              {t("reviewPanelTitle")}
            </p>
            <p className="mb-3 text-xs text-muted-foreground">{t("reviewPanelBody")}</p>
            <div className="space-y-2">
              {reviewDue.map((e) => {
                const days = daysUntil(e.validUntil);
                return (
                  <div
                    key={e._id}
                    className="flex flex-wrap items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{e.thema}</span>
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      {days < 0
                        ? t("expiredSince", {
                            date: formatIsoDate(msToDateInput(e.validUntil), locale),
                          })
                        : t("expiresInDays", { count: days })}
                    </span>
                    {canManage && (
                      <Button size="sm" variant="outline" onClick={() => void onExtend(e)}>
                        {t("extendBy3Months")}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {entries === undefined ? null : sorted.length === 0 ? (
          <EmptyState
            icon={showArchive ? <Archive /> : <Sparkles />}
            title={showArchive ? t("archiveEmpty") : t("noResults")}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {sorted.map((e) => (
              <EntryCard key={e._id} entry={e} canManage={canManage} onEdit={() => setEditing(e)} />
            ))}
          </div>
        )}
      </div>

      <EntryDialog entry={editing} onOpenChange={() => setEditing(null)} />
      <CategoryManagerDialog open={categoryManagerOpen} onOpenChange={setCategoryManagerOpen} />
    </div>
  );
}
