"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { RichText } from "@/components/ui/rich-text";
import { formatIsoDate } from "@/lib/format";

/**
 * Read-only rendering of how a draft wiki entry will look once published —
 * reused by the composer's desktop split pane and mobile "Preview" toggle,
 * mirroring the detail page's actual layout closely enough to be a useful
 * preview (category, tags, body, link, validity) without duplicating that
 * page's sidebar/attachments/read-confirmation chrome, none of which exists
 * yet for a draft that hasn't been saved.
 */
export function WikiEntryPreview({
  thema,
  erklaerung,
  tags,
  link,
  categoryName,
  categoryColor,
  ownerName,
  validFrom,
  validUntil,
  locale,
}: {
  thema: string;
  erklaerung: string;
  tags: string[];
  link: string;
  categoryName?: string;
  categoryColor?: string;
  ownerName: string;
  /** `<input type="date">`-format strings, as `useWikiEntryForm` already
   *  keeps them — passed straight through rather than round-tripped
   *  through milliseconds. */
  validFrom: string;
  validUntil: string;
  locale: string;
}) {
  const t = useTranslations("Guidebooks");

  return (
    <div className="rounded-xl border border-border/70 bg-card px-5 py-4">
      <p
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: categoryColor || "var(--muted-foreground)" }}
      >
        {categoryName || t("fieldCategoryPlaceholder")}
      </p>
      <p className="mt-0.5 font-display text-xl font-bold tracking-tight">
        {thema.trim() || t("fieldThemaPlaceholder")}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("ownerLabel", { name: ownerName })} · {formatIsoDate(validFrom, locale)} –{" "}
        {formatIsoDate(validUntil, locale)}
      </p>
      {tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="muted" className="font-normal">
              #{tag}
            </Badge>
          ))}
        </div>
      )}
      <div className="mt-3.5 border-t border-border/60 pt-3.5">
        {erklaerung.trim() ? (
          <RichText html={erklaerung} className="text-sm leading-relaxed" />
        ) : (
          <p className="text-sm text-muted-foreground">{t("emptyEntry")}</p>
        )}
        {link.trim() && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block break-all text-sm font-medium text-primary hover:underline"
          >
            {link}
          </a>
        )}
      </div>
    </div>
  );
}
