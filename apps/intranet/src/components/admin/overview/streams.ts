import {
  ClipboardCheck,
  Clock,
  KeyRound,
  Lightbulb,
  Mail,
  Megaphone,
  ScrollText,
  ShieldAlert,
  TriangleAlert,
  Upload,
  UserPlus,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * The mapping layer between the backend's stable string keys
 * (`adminOverview.queue` / `.timelines`) and how they present: icon,
 * destination, i18n key. Kept out of the Convex module on purpose — routing and
 * translation are client concerns, and the backend should not need editing to
 * move a page or rename a label.
 */

export interface QueueMeta {
  icon: LucideIcon;
  href: string;
  /** Key under `Admin.overview.queue`. */
  labelKey: string;
}

export const QUEUE_META: Record<string, QueueMeta> = {
  accessRequests: { icon: Clock, href: "/admin/requests", labelKey: "accessRequests" },
  invites: { icon: Mail, href: "/admin/invites", labelKey: "invites" },
  uploads: { icon: Upload, href: "/admin/uploads", labelKey: "uploads" },
  itTickets: { icon: Wrench, href: "/it-tickets", labelKey: "itTickets" },
  errorReports: { icon: TriangleAlert, href: "/fehlermanagement", labelKey: "errorReports" },
  errorMeasures: {
    icon: ClipboardCheck,
    href: "/fehlermanagement/measures",
    labelKey: "errorMeasures",
  },
  suggestions: { icon: Lightbulb, href: "/suggestions", labelKey: "suggestions" },
  passwordResets: { icon: KeyRound, href: "/admin/password-resets", labelKey: "passwordResets" },
  orgDataReview: { icon: ShieldAlert, href: "/admin/structure", labelKey: "orgDataReview" },
};

/**
 * Queue order is fixed and by *consequence*, not by count — a single access
 * request means somebody cannot sign in at all, which outranks forty open
 * suggestions. Sorting by size would bury it under whatever happens to be
 * noisy this week.
 */
export const QUEUE_ORDER = [
  "accessRequests",
  "passwordResets",
  "uploads",
  "invites",
  "errorReports",
  "errorMeasures",
  "itTickets",
  "suggestions",
  "orgDataReview",
];

/**
 * Timeline series, grouped into the families the big chart switches between.
 *
 * Two hard constraints shape these groups. A family never mixes measures of
 * different scale (that's the road to a dual-axis chart), and it never exceeds
 * three series — `--chart-1…3` are the slots validated for arbitrary
 * combinations, and past three converging lines the labels stop working.
 *
 * `slot` pins each series to a palette slot *within its family*, so a series
 * keeps its colour no matter which family is on screen and switching families
 * never repaints a survivor.
 */
export interface StreamDef {
  key: string;
  slot: 1 | 2 | 3;
  /** Whether a rising line is good news — drives the delta chip's colour. */
  goodWhen: "up" | "down" | "neutral";
}

export interface StreamFamily {
  key: string;
  icon: LucideIcon;
  /** Key under `Admin.overview.families`. */
  labelKey: string;
  href: string;
  series: StreamDef[];
  /** Series whose sparkline represents the family on its tile. */
  leadKey: string;
  adminOnly?: boolean;
}

export const STREAM_FAMILIES: StreamFamily[] = [
  {
    key: "support",
    icon: Wrench,
    labelKey: "support",
    href: "/it-tickets",
    leadKey: "ticketsOpened",
    series: [
      { key: "ticketsOpened", slot: 1, goodWhen: "neutral" },
      { key: "ticketsClosed", slot: 3, goodWhen: "up" },
    ],
  },
  {
    key: "quality",
    icon: TriangleAlert,
    labelKey: "quality",
    href: "/fehlermanagement",
    leadKey: "errorsOpened",
    series: [
      { key: "errorsOpened", slot: 1, goodWhen: "down" },
      { key: "errorsClosed", slot: 3, goodWhen: "up" },
    ],
  },
  {
    key: "access",
    icon: UserPlus,
    labelKey: "access",
    href: "/admin/requests",
    leadKey: "requests",
    series: [
      { key: "requests", slot: 1, goodWhen: "neutral" },
      { key: "joined", slot: 2, goodWhen: "neutral" },
      { key: "uploads", slot: 3, goodWhen: "neutral" },
    ],
  },
  {
    key: "comms",
    icon: Megaphone,
    labelKey: "comms",
    href: "/announcements",
    leadKey: "announcements",
    series: [
      { key: "announcements", slot: 1, goodWhen: "neutral" },
      { key: "updates", slot: 2, goodWhen: "neutral" },
      { key: "suggestions", slot: 3, goodWhen: "up" },
    ],
  },
  {
    key: "governance",
    icon: ScrollText,
    labelKey: "governance",
    href: "/admin/audit",
    leadKey: "adminActions",
    adminOnly: true,
    series: [{ key: "adminActions", slot: 1, goodWhen: "neutral" }],
  },
];

export const RANGE_OPTIONS = [7, 30, 90] as const;
export type RangeOption = (typeof RANGE_OPTIONS)[number];
