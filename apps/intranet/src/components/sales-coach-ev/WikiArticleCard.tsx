"use client";

import { useState } from "react";

import { ExternalLink, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { type WikiArticle } from "./types";

export function WikiArticleCard({
  article,
  isAdmin,
  onEdit,
}: {
  article: WikiArticle;
  isAdmin: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations("SalesCoachEv");
  const [open, setOpen] = useState(false);
  const tags = article.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        className="flex items-start justify-between gap-2.5 px-4 py-3 hover:bg-muted/40"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold tracking-tight">{article.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-0.5">{article.cat}</span>
            {tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Pencil className="size-3.5" />
            {t("wikiEdit")}
          </Button>
        )}
      </div>
      {open && (
        <div className="border-t border-border px-4 py-3 text-sm leading-relaxed text-foreground/85">
          <div className="whitespace-pre-line">{article.body}</div>
          {article.url && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/15"
            >
              <ExternalLink className="size-3" />
              {article.url.replace(/^https?:\/\//, "").slice(0, 50)}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
