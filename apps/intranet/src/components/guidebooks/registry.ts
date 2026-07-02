import type { ComponentType } from "react";

import { Cloud, FileSearch, type LucideIcon, Wrench } from "lucide-react";

import { type TeamId } from "@/lib/teams";

import { CaseSearchGuidebook } from "./case-search";
import { OneDriveSchulungGuidebook } from "./docs/onedrive-schulung";
import { ProblembehandlungenGuidebook } from "./docs/problembehandlungen";

export interface Guidebook {
  /** URL slug: /guidebooks/<slug> */
  slug: string;
  /** i18n key inside the "Guidebooks" namespace (supports nesting). */
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  /** Teams allowed to open this guidebook. Empty = everyone signed in. */
  teams: TeamId[];
  Component: ComponentType;
}

/**
 * Add new guidebooks here. Drop the converted component in this folder and
 * register it with its slug, copy keys, icon and the teams that may read it.
 */
export const GUIDEBOOKS: Guidebook[] = [
  {
    slug: "case-search",
    titleKey: "caseSearch.title",
    descriptionKey: "caseSearch.description",
    icon: FileSearch,
    teams: ["customer-care"],
    Component: CaseSearchGuidebook,
  },
  {
    slug: "problembehandlungen",
    titleKey: "problembehandlungen.title",
    descriptionKey: "problembehandlungen.description",
    icon: Wrench,
    teams: [],
    Component: ProblembehandlungenGuidebook,
  },
  {
    slug: "onedrive-schulung",
    titleKey: "onedriveSchulung.title",
    descriptionKey: "onedriveSchulung.description",
    icon: Cloud,
    teams: [],
    Component: OneDriveSchulungGuidebook,
  },
];

interface AccessUser {
  role: string;
  teams?: string[];
}

export function canAccessGuidebook(user: AccessUser, gb: Guidebook): boolean {
  // Admins can always open guidebooks (for review/management).
  if (user.role === "admin") return true;
  // No team restriction → available to everyone signed in.
  if (gb.teams.length === 0) return true;
  const mine = user.teams ?? [];
  return gb.teams.some(t => mine.includes(t));
}

export function accessibleGuidebooks(user: AccessUser): Guidebook[] {
  return GUIDEBOOKS.filter(gb => canAccessGuidebook(user, gb));
}

export function getGuidebook(slug: string): Guidebook | undefined {
  return GUIDEBOOKS.find(gb => gb.slug === slug);
}
