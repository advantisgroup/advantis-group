"use client";

import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { NotebookPen, Pin } from "lucide-react";
import { useTranslations } from "next-intl";

import { DashCard, Row, RowSkeletons } from "./primitives";

const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 5;
const EMPTY_SLUGS: string[] = [];

interface NewWikiEntry {
  slug: string;
  thema: string;
  erklaerung: string;
  pinned: boolean;
  createdAt: number;
}

/** New (created within the last 30 days) wiki entries the current user
 * hasn't opened yet, pinned ones first. Shared by the dashboard section and
 * its "should we even show that section" check. */
export function useNewWikiPages(): NewWikiEntry[] | undefined {
  const entries = useQuery(api.wikiEntries.list);
  const readSlugs = useQuery(api.guidebookReads.listMine) ?? EMPTY_SLUGS;

  return useMemo(() => {
    if (!entries) return undefined;
    const readSet = new Set(readSlugs);
    const now = Date.now();

    return entries
      .filter((e) => now - e.createdAt < NEW_WINDOW_MS && !readSet.has(e.slug))
      .map((e) => ({
        slug: e.slug,
        thema: e.thema,
        erklaerung: e.erklaerung,
        pinned: e.pinned,
        createdAt: e.createdAt,
      }))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
      .slice(0, MAX_ITEMS);
  }, [entries, readSlugs]);
}

export function NewWikiCard() {
  const t = useTranslations("Dashboard");
  const items = useNewWikiPages();

  return (
    <DashCard icon={<NotebookPen />} title={t("newWikiTitle")} count={items?.length || undefined}>
      {items === undefined ? (
        <RowSkeletons />
      ) : (
        items.map((e) => (
          <Row
            key={e.slug}
            href={`/guidebooks/${e.slug}`}
            title={e.thema}
            subtitle={e.erklaerung}
            leading={
              e.pinned ? (
                <Pin className="size-4 shrink-0 text-primary" />
              ) : (
                <span className="size-1.5 shrink-0 rounded-full bg-primary/60" />
              )
            }
          />
        ))
      )}
    </DashCard>
  );
}
