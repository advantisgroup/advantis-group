"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import { useTranslations } from "next-intl";

import {
  accessibleGuidebooks,
  type Guidebook,
  type GuidebookCategory,
} from "@/components/guidebooks/registry";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import { useCurrentUser } from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type CategoryFilter = "all" | GuidebookCategory;

function GuidebookCardItem({
  gb,
  favorite,
  onToggleFavorite,
}: {
  gb: Guidebook;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const t = useTranslations("Guidebooks");
  const Icon = gb.icon;
  return (
    <Card className="group relative h-full transition-shadow hover:shadow-[0_2px_4px_0_rgb(0_0_0/0.05),0_16px_36px_-20px_rgb(0_0_0/0.18)]">
      <Link href={`/guidebooks/${gb.slug}`} className="block h-full">
        <CardContent className="flex h-full items-start gap-3 p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display font-semibold tracking-tight">
              {t(gb.titleKey)}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t(gb.descriptionKey)}
            </p>
          </div>
          <ChevronRight className="mt-6 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </CardContent>
      </Link>
      <button
        type="button"
        aria-label={favorite ? t("removeFavorite") : t("addFavorite")}
        aria-pressed={favorite}
        onClick={onToggleFavorite}
        className={cn(
          "absolute right-1.5 top-1.5 rounded-md p-2 transition-colors hover:bg-accent sm:right-2.5 sm:top-2.5 sm:p-1",
          favorite
            ? "text-amber-500"
            : "text-muted-foreground/50 hover:text-foreground"
        )}
      >
        <Star className={cn("size-4", favorite && "fill-amber-400")} />
      </button>
    </Card>
  );
}

function GuidebookGrid({
  items,
  favorites,
  onToggleFavorite,
}: {
  items: Guidebook[];
  favorites: string[];
  onToggleFavorite: (slug: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map(gb => (
        <GuidebookCardItem
          key={gb.slug}
          gb={gb}
          favorite={favorites.includes(gb.slug)}
          onToggleFavorite={() => onToggleFavorite(gb.slug)}
        />
      ))}
    </div>
  );
}

export default function GuidebooksPage() {
  const t = useTranslations("Guidebooks");
  const user = useCurrentUser();
  const guidebooks = accessibleGuidebooks(user);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const prefs = useQuery(api.userPreferences.getMine);
  const setPrefs = useMutation(api.userPreferences.setMine);

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
  const interactive = favoritesFirst(
    searched.filter(gb => gb.category === "interactive")
  );
  const guides = favoritesFirst(searched.filter(gb => gb.category === "guide"));
  const hasBothCategories = interactive.length > 0 && guides.length > 0;

  const filtered =
    category === "interactive"
      ? interactive
      : category === "guide"
        ? guides
        : favoritesFirst(searched);

  function toggleFavorite(slug: string) {
    const next = favorites.includes(slug)
      ? favorites.filter(f => f !== slug)
      : [...favorites, slug];
    void setPrefs({ favoriteGuidebooks: next });
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

          {hasBothCategories && (
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  {
                    key: "all",
                    label: t("categoryAll"),
                    count: searched.length,
                  },
                  {
                    key: "interactive",
                    label: t("categoryInteractive"),
                    count: interactive.length,
                  },
                  {
                    key: "guide",
                    label: t("categoryGuide"),
                    count: guides.length,
                  },
                ] as const
              ).map(c => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  aria-pressed={category === c.key}
                  className={cn(
                    "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    category === c.key
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {c.label} · {c.count}
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
          ) : category === "all" && hasBothCategories ? (
            <div className="space-y-6">
              <section>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="size-3.5 text-primary" />
                  {t("categoryInteractive")}
                  <span className="tabular-nums">· {interactive.length}</span>
                </div>
                <GuidebookGrid
                  items={interactive}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                />
              </section>
              <section>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <BookOpen className="size-3.5 text-primary" />
                  {t("categoryGuide")}
                  <span className="tabular-nums">· {guides.length}</span>
                </div>
                <GuidebookGrid
                  items={guides}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                />
              </section>
            </div>
          ) : (
            <GuidebookGrid
              items={filtered}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
            />
          )}
        </div>
      )}
    </div>
  );
}
