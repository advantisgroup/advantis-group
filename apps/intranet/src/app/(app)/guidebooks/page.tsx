"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, BookOpen, ChevronRight, Search, Star } from "lucide-react";
import { useTranslations } from "next-intl";

import { accessibleGuidebooks } from "@/components/guidebooks/registry";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import { useCurrentUser } from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function GuidebooksPage() {
  const t = useTranslations("Guidebooks");
  const user = useCurrentUser();
  const guidebooks = accessibleGuidebooks(user);
  const [search, setSearch] = useState("");
  const prefs = useQuery(api.userPreferences.getMine);
  const setPrefs = useMutation(api.userPreferences.setMine);

  const favorites = useMemo(
    () => prefs?.favoriteGuidebooks ?? [],
    [prefs]
  );

  const lastVisited = prefs?.lastGuidebookSlug
    ? guidebooks.find(gb => gb.slug === prefs.lastGuidebookSlug)
    : undefined;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? guidebooks.filter(gb =>
          [t(gb.titleKey), t(gb.descriptionKey)].some(text =>
            text.toLowerCase().includes(q)
          )
        )
      : guidebooks;
    // Favorites first, then registry order.
    return [...rows].sort(
      (a, b) =>
        Number(favorites.includes(b.slug)) - Number(favorites.includes(a.slug))
    );
  }, [guidebooks, search, favorites, t]);

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
                className="pl-9"
              />
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
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map(gb => {
                const Icon = gb.icon;
                const favorite = favorites.includes(gb.slug);
                return (
                  <Card
                    key={gb.slug}
                    className="group relative h-full transition-shadow hover:shadow-[0_2px_4px_0_rgb(0_0_0/0.05),0_16px_36px_-20px_rgb(0_0_0/0.18)]"
                  >
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
                      aria-label={
                        favorite ? t("removeFavorite") : t("addFavorite")
                      }
                      aria-pressed={favorite}
                      onClick={() => toggleFavorite(gb.slug)}
                      className={cn(
                        "absolute right-2.5 top-2.5 rounded-md p-1 transition-colors hover:bg-accent",
                        favorite
                          ? "text-amber-500"
                          : "text-muted-foreground/50 hover:text-foreground"
                      )}
                    >
                      <Star
                        className={cn("size-4", favorite && "fill-amber-400")}
                      />
                    </button>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
