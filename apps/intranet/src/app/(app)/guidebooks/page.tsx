"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Clock,
  MessageSquare,
  Pin,
  PinOff,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Wrench,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  accessibleGuidebooks,
  type Guidebook,
  type GuidebookTopic,
} from "@/components/guidebooks/registry";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import {
  useCurrentUser,
  useIsManager,
} from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

import type { LucideIcon } from "lucide-react";

/** "interactive" reuses the registry category; everything else is a topic. */
type GroupKey = "interactive" | GuidebookTopic;

const GROUP_ORDER: GroupKey[] = [
  "interactive",
  "onboarding",
  "collaboration",
  "time-account",
  "it-workplace",
  "management",
];

const GROUP_META: Record<
  GroupKey,
  { labelKey: string; icon: LucideIcon; badgeTint: string; accent: string }
> = {
  interactive: {
    labelKey: "categoryInteractive",
    icon: Sparkles,
    badgeTint: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
    accent: "text-violet-600 dark:text-violet-300",
  },
  onboarding: {
    labelKey: "topicOnboarding",
    icon: BookOpen,
    badgeTint: "bg-primary/10 text-primary",
    accent: "text-primary",
  },
  collaboration: {
    labelKey: "topicCollaboration",
    icon: MessageSquare,
    badgeTint: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
    accent: "text-sky-600 dark:text-sky-300",
  },
  "time-account": {
    labelKey: "topicTimeAccount",
    icon: Clock,
    badgeTint: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
    accent: "text-amber-600 dark:text-amber-300",
  },
  "it-workplace": {
    labelKey: "topicItWorkplace",
    icon: Wrench,
    badgeTint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    accent: "text-emerald-600 dark:text-emerald-300",
  },
  management: {
    labelKey: "topicManagement",
    icon: ShieldCheck,
    badgeTint: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
    accent: "text-rose-600 dark:text-rose-300",
  },
};

function groupOf(gb: Guidebook): GroupKey {
  return gb.category === "interactive"
    ? "interactive"
    : (gb.topic ?? "it-workplace");
}

function GuidebookCardItem({
  gb,
  favorite,
  onToggleFavorite,
  highlighted,
  canHighlight,
  onToggleHighlight,
}: {
  gb: Guidebook;
  favorite: boolean;
  onToggleFavorite: () => void;
  highlighted: boolean;
  canHighlight: boolean;
  onToggleHighlight: () => void;
}) {
  const t = useTranslations("Guidebooks");
  const Icon = gb.icon;
  const tint = GROUP_META[groupOf(gb)].badgeTint;
  return (
    <Card
      className={cn(
        "group relative h-full transition-shadow hover:shadow-[0_2px_4px_0_rgb(0_0_0/0.05),0_16px_36px_-20px_rgb(0_0_0/0.18)]",
        highlighted && "border-primary/30"
      )}
    >
      <Link href={`/guidebooks/${gb.slug}`} className="block h-full">
        <CardContent className="flex h-full items-start gap-3 p-4">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl",
              tint
            )}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 font-display font-semibold tracking-tight">
              {t(gb.titleKey)}
              {gb.minRole && (
                <Badge variant="muted" className="font-normal">
                  {t("managerBadge")}
                </Badge>
              )}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t(gb.descriptionKey)}
            </p>
          </div>
          <ChevronRight className="mt-6 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </CardContent>
      </Link>
      <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 sm:right-2.5 sm:top-2.5">
        {canHighlight && (
          <button
            type="button"
            aria-label={highlighted ? t("unhighlight") : t("highlight")}
            aria-pressed={highlighted}
            onClick={onToggleHighlight}
            className={cn(
              "rounded-md p-2 transition-colors hover:bg-accent sm:p-1",
              highlighted
                ? "text-primary"
                : "text-muted-foreground/50 hover:text-foreground"
            )}
          >
            {highlighted ? (
              <Pin className="size-4 fill-primary/20" />
            ) : (
              <PinOff className="size-4" />
            )}
          </button>
        )}
        <button
          type="button"
          aria-label={favorite ? t("removeFavorite") : t("addFavorite")}
          aria-pressed={favorite}
          onClick={onToggleFavorite}
          className={cn(
            "rounded-md p-2 transition-colors hover:bg-accent sm:p-1",
            favorite
              ? "text-amber-500"
              : "text-muted-foreground/50 hover:text-foreground"
          )}
        >
          <Star className={cn("size-4", favorite && "fill-amber-400")} />
        </button>
      </div>
    </Card>
  );
}

function GuidebookGrid({
  items,
  favorites,
  onToggleFavorite,
  highlightedSlugs,
  canHighlight,
  onToggleHighlight,
}: {
  items: Guidebook[];
  favorites: string[];
  onToggleFavorite: (slug: string) => void;
  highlightedSlugs: string[];
  canHighlight: boolean;
  onToggleHighlight: (slug: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map(gb => (
        <GuidebookCardItem
          key={gb.slug}
          gb={gb}
          favorite={favorites.includes(gb.slug)}
          onToggleFavorite={() => onToggleFavorite(gb.slug)}
          highlighted={highlightedSlugs.includes(gb.slug)}
          canHighlight={canHighlight}
          onToggleHighlight={() => onToggleHighlight(gb.slug)}
        />
      ))}
    </div>
  );
}

export default function GuidebooksPage() {
  const t = useTranslations("Guidebooks");
  const user = useCurrentUser();
  const isManager = useIsManager();
  const handleError = useErrorHandler();
  const guidebooks = accessibleGuidebooks(user);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<"all" | GroupKey>("all");
  const prefs = useQuery(api.userPreferences.getMine);
  const setPrefs = useMutation(api.userPreferences.setMine);
  const highlightedSlugs = useQuery(api.guidebookHighlights.list) ?? [];
  const toggleHighlightMutation = useMutation(api.guidebookHighlights.toggle);

  const favorites = useMemo(() => prefs?.favoriteGuidebooks ?? [], [prefs]);

  const lastVisited = prefs?.lastGuidebookSlug
    ? guidebooks.find(gb => gb.slug === prefs.lastGuidebookSlug)
    : undefined;

  function favoritesFirst(rows: Guidebook[]) {
    return [...rows].sort(
      (a, b) =>
        Number(favorites.includes(b.slug)) - Number(favorites.includes(a.slug))
    );
  }

  const query = search.trim().toLowerCase();
  const searched = query
    ? guidebooks.filter(gb =>
        [t(gb.titleKey), t(gb.descriptionKey)].some(text =>
          text.toLowerCase().includes(query)
        )
      )
    : guidebooks;

  const featured = highlightedSlugs
    .map(slug => searched.find(gb => gb.slug === slug))
    .filter((gb): gb is Guidebook => gb !== undefined);

  const groups = GROUP_ORDER.map(key => ({
    key,
    meta: GROUP_META[key],
    items: favoritesFirst(searched.filter(gb => groupOf(gb) === key)),
  })).filter(g => g.items.length > 0);

  const filtered =
    groupFilter === "all"
      ? favoritesFirst(searched)
      : (groups.find(g => g.key === groupFilter)?.items ?? []);

  function toggleFavorite(slug: string) {
    const next = favorites.includes(slug)
      ? favorites.filter(f => f !== slug)
      : [...favorites, slug];
    void setPrefs({ favoriteGuidebooks: next });
  }

  function toggleHighlight(slug: string) {
    toggleHighlightMutation({ slug })
      .then(res =>
        toast.success(res.highlighted ? t("highlighted") : t("unhighlighted"))
      )
      .catch(handleError);
  }

  return (
    <div className="mx-auto max-w-3xl" data-tour="tour-guidebooks-list">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("subtitle")}
        tourCheckpoint="guidebooks"
      />

      {guidebooks.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title={t("empty")}
          description={t("emptyHint")}
        />
      ) : (
        <div className="space-y-4">
          {featured.length > 0 && (
            <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4">
              <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                <Pin className="size-3.5" />
                {t("featured")}
                <span className="tabular-nums text-primary/70">
                  · {featured.length}
                </span>
              </div>
              <GuidebookGrid
                items={featured}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                highlightedSlugs={highlightedSlugs}
                canHighlight={isManager}
                onToggleHighlight={toggleHighlight}
              />
            </div>
          )}

          {guidebooks.length > 1 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="h-11 pl-9 sm:h-9"
              />
            </div>
          )}

          {groups.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setGroupFilter("all")}
                aria-pressed={groupFilter === "all"}
                className={cn(
                  "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  groupFilter === "all"
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {t("categoryAll")} · {searched.length}
              </button>
              {groups.map(g => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setGroupFilter(g.key)}
                  aria-pressed={groupFilter === g.key}
                  className={cn(
                    "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    groupFilter === g.key
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {t(g.meta.labelKey)} · {g.items.length}
                </button>
              ))}
            </div>
          )}

          {lastVisited && !search && (
            <Link
              href={`/guidebooks/${lastVisited.slug}`}
              className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 transition-colors hover:bg-primary/10"
            >
              <lastVisited.icon className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 text-sm">
                <span className="text-muted-foreground">
                  {t("continueReading")}{" "}
                </span>
                <span className="font-medium">{t(lastVisited.titleKey)}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-primary" />
            </Link>
          )}

          {filtered.length === 0 ? (
            <EmptyState icon={<Search />} title={t("noResults")} />
          ) : groupFilter === "all" && groups.length > 1 ? (
            <div className="space-y-6">
              {groups.map(g => (
                <section key={g.key}>
                  <div
                    className={cn(
                      "mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider",
                      g.meta.accent
                    )}
                  >
                    <g.meta.icon className="size-3.5" />
                    <span className="text-muted-foreground">
                      {t(g.meta.labelKey)}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      · {g.items.length}
                    </span>
                  </div>
                  <GuidebookGrid
                    items={g.items}
                    favorites={favorites}
                    onToggleFavorite={toggleFavorite}
                    highlightedSlugs={highlightedSlugs}
                    canHighlight={isManager}
                    onToggleHighlight={toggleHighlight}
                  />
                </section>
              ))}
            </div>
          ) : (
            <GuidebookGrid
              items={filtered}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              highlightedSlugs={highlightedSlugs}
              canHighlight={isManager}
              onToggleHighlight={toggleHighlight}
            />
          )}
        </div>
      )}
    </div>
  );
}
