"use client";

import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { NotebookPen, Pin } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  canAccessGuidebook,
  guidebookDescription,
  guidebookTitle,
  type Guidebook,
  type GuidebookTopic,
} from "@/components/guidebooks/registry";
import { useCurrentUser } from "@/components/providers/current-user";

import { DashCard, Row, RowSkeletons } from "./primitives";

/** Mirrors the guidebooks list page's own window — see
 * `isRecentlyCreatedGuidebook` in `app/(app)/guidebooks/page.tsx`. */
const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 5;
const EMPTY_SLUGS: string[] = [];

interface NewWikiEntry extends Guidebook {
  pinned: boolean;
}

/** New (created within the last 30 days) custom wiki pages the current user
 * hasn't opened yet, accessible to their team/role, pinned ones first. Shared
 * by the dashboard section and its "should we even show that section" check. */
export function useNewWikiPages(): NewWikiEntry[] | undefined {
  const user = useCurrentUser();
  const customPages = useQuery(api.guidebookPages.list);
  const readSlugs = useQuery(api.guidebookReads.listMine);
  const highlightedSlugs = useQuery(api.guidebookHighlights.list) ?? EMPTY_SLUGS;

  return useMemo(() => {
    if (!customPages || !readSlugs) return undefined;
    const readSet = new Set(readSlugs);
    const pinnedOrder = new Map(highlightedSlugs.map((slug, i) => [slug, i]));
    const now = Date.now();

    return customPages
      .filter((p) => now - p.createdAt < NEW_WINDOW_MS && !readSet.has(p.slug))
      .map((p) => ({
        slug: p.slug,
        title: p.title,
        description: p.description,
        custom: true as const,
        icon: NotebookPen,
        category: "guide" as const,
        topic: p.topic as GuidebookTopic,
        minRole: p.minRole ?? undefined,
        teams: p.teams as Guidebook["teams"],
        createdAt: p.createdAt,
        pinned: pinnedOrder.has(p.slug),
      }))
      .filter((gb) => canAccessGuidebook(user, gb))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
      .slice(0, MAX_ITEMS);
  }, [customPages, readSlugs, highlightedSlugs, user]);
}

export function NewWikiCard() {
  const t = useTranslations("Dashboard");
  const tg = useTranslations("Guidebooks");
  const items = useNewWikiPages();

  return (
    <DashCard icon={<NotebookPen />} title={t("newWikiTitle")} count={items?.length || undefined}>
      {items === undefined ? (
        <RowSkeletons />
      ) : (
        items.map((gb) => (
          <Row
            key={gb.slug}
            href={`/guidebooks/${gb.slug}`}
            title={guidebookTitle(gb, tg)}
            subtitle={guidebookDescription(gb, tg)}
            leading={
              gb.pinned ? (
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
