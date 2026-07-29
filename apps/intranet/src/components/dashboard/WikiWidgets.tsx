"use client";

import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { CheckCircle2, NotebookPen, Pin } from "lucide-react";
import { useTranslations } from "next-intl";

import { htmlToText } from "@/components/ui/rich-text";

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
