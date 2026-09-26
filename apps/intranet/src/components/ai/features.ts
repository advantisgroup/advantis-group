import {
  CalendarCheck,
  CircleHelp,
  Compass,
  FileText,
  FileUp,
  LayoutDashboard,
  type LucideIcon,
  MessagesSquare,
  PhoneCall,
  RefreshCw,
  Tags,
  WandSparkles,
} from "lucide-react";

import { type AiRunKind } from "./use-ai-run";

/** The AI features that can start a run, in the order someone meets them. */
export const AI_FEATURES: { key: AiRunKind; icon: LucideIcon }[] = [
  { key: "wikiChat", icon: MessagesSquare },
  { key: "ask", icon: CircleHelp },
  { key: "dailyBrief", icon: LayoutDashboard },
  { key: "navigate", icon: Compass },
  { key: "wikiFormat", icon: WandSparkles },
  { key: "wikiMeta", icon: Tags },
  { key: "coachReport", icon: PhoneCall },
  { key: "coachEod", icon: CalendarCheck },
  { key: "coachWikiExtract", icon: FileUp },
  { key: "cvExtract", icon: FileText },
  { key: "cvRescan", icon: RefreshCw },
];

export const AI_FEATURE_ICON = Object.fromEntries(
  AI_FEATURES.map((feature) => [feature.key, feature.icon]),
) as Record<AiRunKind, LucideIcon>;

/** Runs and their transcripts are deleted this long after they started
 * (RETENTION_MS in packages/convex/convex/aiRuns.ts). */
export const AI_RETENTION_MS = 30 * 86_400_000;
