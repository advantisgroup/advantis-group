"use client";

import { useMemo, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { CheckCircle2, ChevronDown, ChevronUp, NotebookPen, Pin } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { htmlToText } from "@/components/ui/rich-text";
import { cn } from "@/lib/utils";

import { DashCard, Row, RowSkeletons } from "./primitives";

const MAX_ITEMS = 10;
const EMPTY_SLUGS: string[] = [];

interface LatestWikiEntry {
  slug: string;
  title: string;
  snippet: string;
  pinned: boolean;
  read: boolean;
  updatedAt: number;
}

/** The 10 most recently updated wiki entries (wiki-v2 + not-yet-migrated
 * legacy pages, merged), pinned ones first — shared by the dashboard
 * section and its "should we even show that section" check. */
export function useLatestWikiPages(): LatestWikiEntry[] | undefined {
  const entries = useQuery(api.wikiEntries.list);
  const legacyPages = useQuery(api.guidebookPages.list);
  const readSlugs = useQuery(api.guidebookReads.listMine) ?? EMPTY_SLUGS;

  return useMemo(() => {
    if (entries === undefined || legacyPages === undefined) return undefined;
    const readSet = new Set(readSlugs);
    const migratedSlugs = new Set(entries.map((e) => e.slug));

    const wikiItems: LatestWikiEntry[] = entries.map((e) => ({
      slug: e.slug,
      title: e.thema,
      snippet: htmlToText(e.erklaerung),
      pinned: e.pinned,
      read: readSet.has(e.slug),
      updatedAt: e.updatedAt,
    }));
    const legacyItems: LatestWikiEntry[] = legacyPages
      .filter((p) => !migratedSlugs.has(p.slug))
      .map((p) => ({
        slug: p.slug,
        title: p.title,
        snippet: p.description,
        pinned: false,
        read: readSet.has(p.slug),
        updatedAt: p.updatedAt,
      }));

    return [...wikiItems, ...legacyItems]
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
      .slice(0, MAX_ITEMS);
  }, [entries, legacyPages, readSlugs]);
}

export function LatestWikiCard() {
  const t = useTranslations("Dashboard");
  const items = useLatestWikiPages();

  return (
    <DashCard icon={<NotebookPen />} title={t("newWikiTitle")} count={items?.length || undefined}>
      {items === undefined ? (
        <RowSkeletons />
      ) : (
        items.map((e) => (
          <Row
            key={e.slug}
            href={`/guidebooks/${e.slug}`}
            title={e.title}
            subtitle={e.snippet}
            leading={
              e.pinned ? (
                <Pin className="size-4 shrink-0 text-primary" />
              ) : (
                <span className="size-1.5 shrink-0 rounded-full bg-primary/60" />
              )
            }
            trailing={
              e.read ? (
                <CheckCircle2 className="size-3.5 shrink-0 text-muted-foreground/60" />
              ) : undefined
            }
          />
        ))
      )}
    </DashCard>
  );
}

const CARD_HEIGHT = 116;

/**
 * A dedicated vertical carousel of the latest 10 wikis — deliberately not a
 * `DashCard`/`WidgetGrid` tile (see `LatestWikiCard`, kept unused above in
 * case a grid tile is ever wanted again): the dashboard gives it its own
 * tall, narrow column instead, one card snapped into view at a time, with
 * up/down controls plus a side rail of dots for jumping directly to one.
 */
export function WikiCarousel() {
  const t = useTranslations("Dashboard");
  const items = useLatestWikiPages();
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function scrollToIndex(i: number) {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(i, (items?.length ?? 1) - 1));
    track.scrollTo({ top: clamped * CARD_HEIGHT, behavior: "smooth" });
    setActive(clamped);
  }

  return (
    <div className="flex gap-2 rounded-2xl border border-border/70 bg-card p-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <NotebookPen className="size-3.5" />
            {t("newWikiTitle")}
          </span>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={active === 0}
              onClick={() => scrollToIndex(active - 1)}
              aria-label={t("wikiCarouselPrev")}
            >
              <ChevronUp className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!items || active >= items.length - 1}
              onClick={() => scrollToIndex(active + 1)}
              aria-label={t("wikiCarouselNext")}
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </div>
        </div>

        {items === undefined ? (
          <div className="space-y-2 px-1">
            <RowSkeletons />
          </div>
        ) : items.length === 0 ? null : (
          <div
            ref={trackRef}
            onScroll={(e) => {
              const i = Math.round(e.currentTarget.scrollTop / CARD_HEIGHT);
              if (i !== active) setActive(i);
            }}
            className="flex snap-y snap-mandatory flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ height: CARD_HEIGHT }}
          >
            {items.map((e) => (
              <Link
                key={e.slug}
                href={`/guidebooks/${e.slug}`}
                className="flex shrink-0 snap-start flex-col justify-center gap-1.5 rounded-xl px-2 py-2 transition-colors hover:bg-accent"
                style={{ height: CARD_HEIGHT }}
              >
                <div className="flex items-center gap-2">
                  {e.pinned ? (
                    <Pin className="size-3.5 shrink-0 text-primary" />
                  ) : (
                    <span className="size-1.5 shrink-0 rounded-full bg-primary/60" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.title}</span>
                  {e.read && (
                    <CheckCircle2 className="size-3.5 shrink-0 text-muted-foreground/60" />
                  )}
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{e.snippet}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {items && items.length > 1 && (
        <div className="flex shrink-0 flex-col items-center justify-center gap-1.5 py-1">
          {items.map((e, i) => (
            <button
              key={e.slug}
              type="button"
              aria-label={e.title}
              onClick={() => scrollToIndex(i)}
              className={cn(
                "size-1.5 shrink-0 rounded-full transition-all",
                i === active
                  ? "h-3.5 bg-primary"
                  : "bg-muted-foreground/30 hover:bg-muted-foreground/60",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
