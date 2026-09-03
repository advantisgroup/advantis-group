"use client";

import { useMemo, useState } from "react";

import { Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsAdmin } from "@/components/providers/current-user";
import { useSalesCoachWiki } from "@/lib/sales-coach-ev-api";
import { cn } from "@/lib/utils";

import { WIKI_CATEGORIES } from "./constants";
import { type WikiArticle } from "./types";
import { WikiArticleCard } from "./WikiArticleCard";
import { WikiEditorDialog } from "./WikiEditorDialog";

export function WikiView() {
  const t = useTranslations("SalesCoachEv");
  const isAdmin = useIsAdmin();
  const { articles, refresh } = useSalesCoachWiki();
  const [category, setCategory] = useState<string>("alle");
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<WikiArticle | null>(null);

  const filtered = useMemo(() => {
    let items = articles ?? [];
    if (category !== "alle") items = items.filter((a) => a.cat === category);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.body.toLowerCase().includes(q) ||
          a.tags.toLowerCase().includes(q),
      );
    }
    return items;
  }, [articles, category, query]);

  const countFor = (cat: string) =>
    cat === "alle" ? (articles ?? []).length : (articles ?? []).filter((a) => a.cat === cat).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{t("wikiPageTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("wikiPageSubtitle")}</p>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => {
              setEditingArticle(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="size-3.5" />
            {t("wikiNewArticle")}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[200px_1fr]">
        <div className="h-fit overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t("wikiCategories")}
          </div>
          <ul className="py-1">
            {["alle", ...WIKI_CATEGORIES].map((cat) => (
              <li key={cat}>
                <button
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={cn(
                    "flex w-full items-center justify-between border-l-2 border-transparent px-3.5 py-2 text-left text-[13px] hover:bg-muted/40",
                    category === cat && "border-primary bg-primary/10 font-semibold text-primary",
                  )}
                >
                  {cat === "alle" ? t("wikiAllCategories") : cat}
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {countFor(cat)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("wikiSearchPlaceholderFull")}
              className="pl-9"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              {query ? t("wikiNoResultsFor", { query }) : t("wikiEmptyState")}
            </div>
          ) : (
            <div className="space-y-2.5">
              {filtered.map((a) => (
                <WikiArticleCard
                  key={a._id}
                  article={a}
                  isAdmin={isAdmin}
                  onEdit={() => {
                    setEditingArticle(a);
                    setEditorOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <WikiEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        article={editingArticle}
        onSaved={refresh}
      />
    </div>
  );
}
