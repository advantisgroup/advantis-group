"use client";

import { useMemo, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { CheckCircle2, ChevronLeft, ChevronRight, NotebookPen, Pin } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { htmlToText } from "@/components/ui/rich-text";
import { cn } from "@/lib/utils";

import { DashCard, Row, RowSkeletons } from "./primitives";
import { SectionHeading } from "./SectionHeading";

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
  const legacyPages = useQuery(api.guidebooks.pages.list);
  const readSlugs = useQuery(api.guidebooks.reads.listMine) ?? EMPTY_SLUGS;

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

const GROUP_SIZE = 5;

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

/**
 * A dedicated horizontal carousel of the latest 10 wikis — deliberately not
 * a `DashCard`/`WidgetGrid` tile (see `LatestWikiCard`, kept unused above in
 * case a grid tile is ever wanted again): items are paged in groups of
 * `GROUP_SIZE`, scrolling left/right one group at a time, with a row of
 * dots below for jumping directly to a group. Touch/trackpad swiping works
 * natively via scroll-snap; the chevrons are just a discoverable affordance
 * on top of that.
 */
export function WikiCarousel() {
  const t = useTranslations("Dashboard");
  const items = useLatestWikiPages();
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const groups = useMemo(() => (items ? chunk(items, GROUP_SIZE) : []), [items]);

  function scrollToGroup(i: number) {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(i, groups.length - 1));
    const width = track.clientWidth;
    track.scrollTo({ left: clamped * width, behavior: "smooth" });
    setActive(clamped);
  }

  return (
    <div>
      <SectionHeading
        icon={<NotebookPen />}
        title={t("sectionNewWiki")}
        action={
          groups.length > 1 && (
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={active === 0}
                onClick={() => scrollToGroup(active - 1)}
                aria-label={t("wikiCarouselPrev")}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={active >= groups.length - 1}
                onClick={() => scrollToGroup(active + 1)}
                aria-label={t("wikiCarouselNext")}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )
        }
      />
      <div className="flex flex-col gap-1 rounded-2xl border border-border/70 bg-card p-2">
        {items === undefined ? (
          <div className="space-y-2">
            <RowSkeletons />
          </div>
        ) : items.length === 0 ? null : (
          <div
            ref={trackRef}
            onScroll={(e) => {
              const width = e.currentTarget.clientWidth || 1;
              const i = Math.round(e.currentTarget.scrollLeft / width);
              if (i !== active) setActive(i);
            }}
            className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {groups.map((group, gi) => (
              <div
                key={gi}
                className="grid w-full shrink-0 snap-start grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-5"
              >
                {group.map((e) => (
                  <Link
                    key={e.slug}
                    href={`/guidebooks/${e.slug}`}
                    className="flex min-w-0 flex-col justify-center gap-1.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-accent/60 active:bg-accent"
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
            ))}
          </div>
        )}

        {groups.length > 1 && (
          <div className="flex shrink-0 items-center justify-center">
            {/* The dot is tiny, the button around it is thumb-sized. */}
            {groups.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${t("newWikiTitle")} ${i + 1}`}
                aria-current={i === active ? "true" : undefined}
                onClick={() => scrollToGroup(i)}
                className="group/dot grid h-8 min-w-6 place-items-center px-1 sm:h-5"
              >
                <span
                  className={cn(
                    "block size-1.5 rounded-full transition-all",
                    i === active
                      ? "w-3.5 bg-primary"
                      : "bg-muted-foreground/30 group-hover/dot:bg-muted-foreground/60",
                  )}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
