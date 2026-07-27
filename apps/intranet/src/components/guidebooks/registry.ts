import type { ComponentType } from "react";

import {
  CalendarCheck,
  CalendarDays,
  Clock,
  Cloud,
  FileSearch,
  KeyRound,
  ListChecks,
  type LucideIcon,
  Mail,
  Megaphone,
  MessageSquare,
  ShieldCheck,
  UploadCloud,
  UserCog,
  Wrench,
  Zap,
} from "lucide-react";

import { type TeamId } from "@/lib/teams";

import { CaseSearchGuidebook } from "./case-search";
import { AbwesenheitenGenehmigenGuidebook } from "./docs/abwesenheiten-genehmigen";
import { AnkuendigungenTermineGuidebook } from "./docs/ankuendigungen-termine";
import { ChatTippsGuidebook } from "./docs/chat-tipps";
import { ClockodoZeiterfassungGuidebook } from "./docs/clockodo-zeiterfassung";
import { EmailSignaturenGuidebook } from "./docs/email-signaturen";
import { KalenderGuidebook } from "./docs/kalender";
import { OnboardingGuidebook } from "./docs/onboarding";
import { OneDriveSchulungGuidebook } from "./docs/onedrive-schulung";
import { PasswoerterBrowserGuidebook } from "./docs/passwoerter-browser";
import { ProblembehandlungenGuidebook } from "./docs/problembehandlungen";
import { ProfilKontoGuidebook } from "./docs/profil-konto";
import { UploadsGenehmigenGuidebook } from "./docs/uploads-genehmigen";
import { VerwaltungMitgliederGuidebook } from "./docs/verwaltung-mitglieder";

/**
 * "interactive" = a live tool (search, lookup, chat) rather than a fixed
 * article. Drives grouping/filtering in the guidebooks list.
 */
export type GuidebookCategory = "interactive" | "guide";

/**
 * Subject grouping for "guide" category entries — the list page sections
 * guides by topic so the list stays scannable as more get added. Not
 * meaningful for "interactive" entries (they get their own section by
 * category instead).
 */
export type GuidebookTopic =
  | "onboarding"
  | "collaboration"
  | "time-account"
  | "it-workplace"
  | "management";

export interface Guidebook {
  /** URL slug: /guidebooks/<slug> */
  slug: string;
  /** i18n key inside the "Guidebooks" namespace (supports nesting). */
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  category: GuidebookCategory;
  /** Subject grouping, required for "guide" entries (see GuidebookTopic). */
  topic?: GuidebookTopic;
  /**
   * Minimum role required, on top of the team gate below. Omit for anyone
   * signed in. "manager" also admits admins (mirrors `useIsManager`).
   */
  minRole?: "manager" | "admin";
  /** Teams allowed to open this guidebook. Empty = everyone signed in. */
  teams: TeamId[];
  /**
   * Skip the reading-doc furniture (table of contents, "was this helpful"
   * feedback, related-guidebooks chips, prev/next pager) around the
   * component. For a self-contained tool with its own internal navigation
   * (tabs, screens, its own chapter switcher) rather than a single article,
   * that furniture is just clutter competing with the tool's own UI.
   */
  minimalChrome?: boolean;
  /** Widen the page's content column past the default `max-w-4xl` — for
   * tools with tables/dashboards that feel cramped at article width. */
  wide?: boolean;
  /**
   * Rendered by `/guidebooks/[slug]/page.tsx`. Omit when this guidebook owns
   * a dedicated static route tree instead (e.g.
   * `app/(app)/guidebooks/<slug>/**`) — Next.js matches that static segment
   * before the `[slug]` dynamic route, so `[slug]/page.tsx` never actually
   * receives this slug and `Component` would never be rendered anyway. The
   * registry entry still exists for the guidebooks list card and sidebar
   * visibility/access checks.
   */
  Component?: ComponentType;
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
    category: "interactive",
    teams: ["customer-care"],
    Component: CaseSearchGuidebook,
  },
  {
    slug: "wallbox-sales-academy",
    titleKey: "wallboxSalesAcademy.title",
    descriptionKey: "wallboxSalesAcademy.description",
    icon: Zap,
    category: "interactive",
    teams: [],
    // Owns its own route tree — see app/(app)/guidebooks/wallbox-sales-academy/.
  },
  {
    slug: "problembehandlungen",
    titleKey: "problembehandlungen.title",
    descriptionKey: "problembehandlungen.description",
    icon: Wrench,
    category: "guide",
    topic: "it-workplace",
    teams: [],
    Component: ProblembehandlungenGuidebook,
  },
  {
    slug: "onedrive-schulung",
    titleKey: "onedriveSchulung.title",
    descriptionKey: "onedriveSchulung.description",
    icon: Cloud,
    category: "guide",
    topic: "it-workplace",
    teams: [],
    Component: OneDriveSchulungGuidebook,
  },
  {
    slug: "passwoerter-browser",
    titleKey: "passwoerterBrowser.title",
    descriptionKey: "passwoerterBrowser.description",
    icon: KeyRound,
    category: "guide",
    topic: "it-workplace",
    teams: [],
    Component: PasswoerterBrowserGuidebook,
  },
  {
    slug: "email-signaturen",
    titleKey: "emailSignaturen.title",
    descriptionKey: "emailSignaturen.description",
    icon: Mail,
    category: "guide",
    topic: "collaboration",
    teams: [],
    Component: EmailSignaturenGuidebook,
  },
  {
    slug: "chat-tipps",
    titleKey: "chatTipps.title",
    descriptionKey: "chatTipps.description",
    icon: MessageSquare,
    category: "guide",
    topic: "collaboration",
    teams: [],
    Component: ChatTippsGuidebook,
  },
  {
    slug: "kalender",
    titleKey: "kalender.title",
    descriptionKey: "kalender.description",
    icon: CalendarDays,
    category: "guide",
    topic: "collaboration",
    teams: [],
    Component: KalenderGuidebook,
  },
  {
    slug: "clockodo-zeiterfassung",
    titleKey: "clockodoZeiterfassung.title",
    descriptionKey: "clockodoZeiterfassung.description",
    icon: Clock,
    category: "guide",
    topic: "time-account",
    teams: [],
    Component: ClockodoZeiterfassungGuidebook,
  },
  {
    slug: "profil-konto",
    titleKey: "profilKonto.title",
    descriptionKey: "profilKonto.description",
    icon: UserCog,
    category: "guide",
    topic: "time-account",
    teams: [],
    Component: ProfilKontoGuidebook,
  },
  {
    slug: "onboarding",
    titleKey: "onboarding.title",
    descriptionKey: "onboarding.description",
    icon: ListChecks,
    category: "guide",
    topic: "onboarding",
    teams: [],
    Component: OnboardingGuidebook,
  },
  {
    slug: "abwesenheiten-genehmigen",
    titleKey: "abwesenheitenGenehmigen.title",
    descriptionKey: "abwesenheitenGenehmigen.description",
    icon: CalendarCheck,
    category: "guide",
    topic: "management",
    minRole: "manager",
    teams: [],
    Component: AbwesenheitenGenehmigenGuidebook,
  },
  {
    slug: "verwaltung-mitglieder",
    titleKey: "verwaltungMitglieder.title",
    descriptionKey: "verwaltungMitglieder.description",
    icon: ShieldCheck,
    category: "guide",
    topic: "management",
    minRole: "manager",
    teams: [],
    Component: VerwaltungMitgliederGuidebook,
  },
  {
    slug: "ankuendigungen-termine",
    titleKey: "ankuendigungenTermine.title",
    descriptionKey: "ankuendigungenTermine.description",
    icon: Megaphone,
    category: "guide",
    topic: "management",
    minRole: "manager",
    teams: [],
    Component: AnkuendigungenTermineGuidebook,
  },
  {
    slug: "uploads-genehmigen",
    titleKey: "uploadsGenehmigen.title",
    descriptionKey: "uploadsGenehmigen.description",
    icon: UploadCloud,
    category: "guide",
    topic: "management",
    minRole: "manager",
    teams: [],
    Component: UploadsGenehmigenGuidebook,
  },
];

interface AccessUser {
  role: string;
  teams?: string[];
}

export function canAccessGuidebook(user: AccessUser, gb: Guidebook): boolean {
  // Admins can always open guidebooks (for review/management).
  if (user.role === "admin") return true;
  if (gb.minRole === "admin") return false; // admin already handled above
  if (gb.minRole === "manager" && user.role !== "manager") return false;
  // No team restriction → available to everyone signed in.
  if (gb.teams.length === 0) return true;
  const mine = user.teams ?? [];
  return gb.teams.some((t) => mine.includes(t));
}

export function accessibleGuidebooks(user: AccessUser): Guidebook[] {
  return GUIDEBOOKS.filter((gb) => canAccessGuidebook(user, gb));
}

export function getGuidebook(slug: string): Guidebook | undefined {
  return GUIDEBOOKS.find((gb) => gb.slug === slug);
}
