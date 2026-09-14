import {
  BookOpen,
  Building2,
  Lightbulb,
  Megaphone,
  Newspaper,
  Rss,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { type DraftSurface } from "@/components/compose/use-draft";

// `listHref` is only the way back for drafts saved before they remembered
// their own address. Label keys are in the "Drafts" messages.
export const DRAFT_SURFACES: Partial<
  Record<DraftSurface, { icon: LucideIcon; labelKey: string; listHref: string }>
> = {
  wikiEntry: { icon: BookOpen, labelKey: "surfaceWikiEntry", listHref: "/guidebooks" },
  guidebookPage: { icon: BookOpen, labelKey: "surfaceGuidebookPage", listHref: "/guidebooks" },
  blogPost: { icon: Newspaper, labelKey: "surfaceBlogPost", listHref: "/blog" },
  announcement: { icon: Megaphone, labelKey: "surfaceAnnouncement", listHref: "/announcements" },
  update: { icon: Rss, labelKey: "surfaceUpdate", listHref: "/updates" },
  suggestion: { icon: Lightbulb, labelKey: "surfaceSuggestion", listHref: "/suggestions" },
  itTicket: { icon: Wrench, labelKey: "surfaceItTicket", listHref: "/it-tickets" },
  coachWiki: { icon: Zap, labelKey: "surfaceCoachWiki", listHref: "/sales-coach-ev/wiki" },
  salesCockpitProject: {
    icon: Building2,
    labelKey: "surfaceSalesCockpitProject",
    listHref: "/sales-cockpit/projekte",
  },
};
