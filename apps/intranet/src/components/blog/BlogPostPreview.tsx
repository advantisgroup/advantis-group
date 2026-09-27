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
  slug,
  language,
}: {
  title: string;
  excerpt: string;
  body: string;
  coverPreviewUrl: string | null;
  authorName: string;
  slug?: string;
  language?: "de" | "en";
}) {
  const t = useTranslations("Blog");
  const origin = (process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://advantisgroup.de").replace(
    /^https?:\/\//,
    "",
  );
  const path = `${origin}/${language ?? "de"}/blog/${slug?.trim() || "…"}`;
  const shownTitle = title.trim() || t("fieldTitlePlaceholder");
  const snippet = excerpt.trim() || t("previewNoExcerpt");

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
        {coverPreviewUrl ? (
          <div className="relative aspect-video">
            <Image src={coverPreviewUrl} alt={title} fill className="object-cover" unoptimized />
          </div>
        ) : null}
        <div className="px-5 py-4">
          <p className="font-display text-xl tracking-tight font-semibold">
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

      <section>
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t("previewSearch")}</h3>
        <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
          <p className="truncate text-xs text-muted-foreground">{path}</p>
          <p className="mt-0.5 line-clamp-1 text-lg leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
            {shownTitle}
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
            {snippet.length > 155 ? `${snippet.slice(0, 155).trimEnd()}…` : snippet}
          </p>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t("previewShare")}</h3>
        <div className="max-w-md overflow-hidden rounded-xl border border-border/70 bg-card">
          {coverPreviewUrl ? (
            <div className="relative aspect-[1.91/1]">
              <Image src={coverPreviewUrl} alt="" fill className="object-cover" unoptimized />
            </div>
          ) : (
            <div className="grid aspect-[1.91/1] place-items-center bg-muted text-xs text-muted-foreground">
              {t("previewNoCover")}
            </div>
          )}
          <div className="border-t border-border/60 px-3.5 py-2.5">
            <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
              {origin}
            </p>
            <p className="line-clamp-1 text-sm font-semibold">{shownTitle}</p>
            <p className="line-clamp-1 text-xs text-muted-foreground">{snippet}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
