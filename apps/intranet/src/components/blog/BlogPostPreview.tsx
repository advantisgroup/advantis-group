"use client";

import Image from "next/image";

import { useTranslations } from "next-intl";

import { RichText } from "@/components/ui/rich-text";

/**
 * Read-only rendering of how a draft blog post will look once published —
 * reused by the composer's split pane and mobile "Preview" toggle. Mirrors
 * WikiEntryPreview's shape, adapted for blog fields (cover image, excerpt,
 * no category/tags/validity).
 */
export function BlogPostPreview({
  title,
  excerpt,
  body,
  coverPreviewUrl,
  authorName,
}: {
  title: string;
  excerpt: string;
  body: string;
  coverPreviewUrl: string | null;
  authorName: string;
}) {
  const t = useTranslations("Blog");

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
      {coverPreviewUrl ? (
        <div className="relative aspect-video">
          <Image src={coverPreviewUrl} alt={title} fill className="object-cover" unoptimized />
        </div>
      ) : null}
      <div className="px-5 py-4">
        <p className="font-display text-xl font-bold tracking-tight refreshed:font-semibold">
          {title.trim() || t("fieldTitlePlaceholder")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{authorName}</p>
        <div className="mt-3.5 border-t border-border/60 pt-3.5">
          {excerpt.trim() && <p className="text-sm text-muted-foreground italic">{excerpt}</p>}
          {body.trim() ? (
            <RichText html={body} className="mt-3 text-sm leading-relaxed" />
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{t("emptyPost")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
