import type { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";

import type { FunctionReturnType } from "convex/server";

import {
  richDateInputFromTimestamp,
  richDateTimestampFromInput,
  type RichDateKind,
  type RichDateValue,
} from "./rich-date";

export type Announcement = FunctionReturnType<typeof api.announcements.list>[number];

/** Additive: reaches anyone in any of `departments` plus anyone individually
 *  listed in `userIds` — a department pick and a people pick combine rather
 *  than being mutually exclusive choices. */
export type Audience =
  | { kind: "all" }
  | { kind: "mixed"; departments: string[]; userIds: Id<"users">[] };

/** Sentinel for the feed toolbar's category filter — distinct from any
 * category value an admin could actually type (including one literally
 * named "all"). Reserved: `sanitizeCategory` strips it back out if someone
 * types this exact string, so it can never collide with real data. */
export const ALL_CATEGORIES_VALUE = "__all_categories__";
export const CATEGORY_MAX_LENGTH = 40;

export interface DraftRelevantDate {
  id?: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  kind: RichDateKind | "";
  description: string;
  location: string;
}

export function sanitizeCategory(raw: string): string {
  const trimmed = raw.trim();
  return trimmed === ALL_CATEGORIES_VALUE ? "" : trimmed;
}

export interface Draft {
  title: string;
  body: string;
  pinned: boolean;
  requiresAck?: boolean;
  category: string;
  audienceKind: "all" | "mixed";
  audienceDepartments: string[];
  audienceUserIds: string[];
  publishAt: string;
  expiresAt: string;
  relevantDate: DraftRelevantDate | null;
}

export const EMPTY_DRAFT: Draft = {
  title: "",
  body: "",
  pinned: false,
  category: "",
  audienceKind: "all",
  audienceDepartments: [],
  audienceUserIds: [],
  publishAt: "",
  expiresAt: "",
  relevantDate: null,
};

export const DRAFT_KEY = "announcements:draft";

export function msToLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function relevantDateHasValidRange(value: DraftRelevantDate | null): boolean {
  if (!value?.startAt) return true;
  const startAt = richDateTimestampFromInput(value.startAt, value.allDay);
  if (!Number.isFinite(startAt)) return false;
  if (!value.endAt) return true;
  const endAt = richDateTimestampFromInput(value.endAt, value.allDay);
  if (!Number.isFinite(endAt)) return false;
  return value.allDay ? endAt >= startAt : endAt > startAt;
}

export function relevantDateValueOf(value: DraftRelevantDate | null): RichDateValue | undefined {
  if (!value?.startAt || !relevantDateHasValidRange(value)) return undefined;
  const startAt = richDateTimestampFromInput(value.startAt, value.allDay);
  const endAt = value.endAt ? richDateTimestampFromInput(value.endAt, value.allDay) : undefined;
  if (!Number.isFinite(startAt)) return undefined;
  return {
    ...(value.id ? { id: value.id } : {}),
    startAt,
    ...(endAt !== undefined && Number.isFinite(endAt) ? { endAt } : {}),
    allDay: value.allDay,
    ...(value.kind ? { kind: value.kind } : {}),
    ...(value.description.trim() ? { description: value.description.trim() } : {}),
    ...(value.location.trim() ? { location: value.location.trim() } : {}),
  };
}

export function draftRelevantDateOf(value: RichDateValue): DraftRelevantDate {
  return {
    id: value.id ?? crypto.randomUUID(),
    startAt: richDateInputFromTimestamp(value.startAt, value.allDay),
    endAt: value.endAt ? richDateInputFromTimestamp(value.endAt, value.allDay) : "",
    allDay: value.allDay,
    kind: value.kind ?? "",
    description: value.description ?? "",
    location: value.location ?? "",
  };
}

/** Shape of a draft as it may have been saved to localStorage by an earlier
 *  version of the composer, before the audience picker became additive.
 *  Loosely typed on purpose — this only ever describes untrusted
 *  localStorage JSON, not the current `Draft` shape. */
interface LegacyDraftShape {
  audience?: string;
  audienceKind?: string;
  audienceDepartment?: string;
  audienceDepartments?: string[];
  audienceUserIds?: string[];
  [key: string]: unknown;
}

/**
 * Autosaved drafts from earlier versions of the composer stored the audience
 * differently:
 * - oldest: a single `audience` string ("all" or a department name)
 * - pre-additive: an exclusive `audienceKind` of "department" | "users" with
 *   a singular `audienceDepartment`
 * Translate either shape into the current additive one so a still-pending
 * draft doesn't silently lose its targeting on restore.
 */
export function migrateStoredDraft(raw: unknown): Partial<Draft> {
  if (!raw || typeof raw !== "object") return {};
  const parsed = raw as LegacyDraftShape;

  if (parsed.audienceKind === undefined && typeof parsed.audience === "string") {
    const { audience, ...rest } = parsed;
    return {
      ...(rest as Partial<Draft>),
      audienceKind: audience === "all" ? "all" : "mixed",
      audienceDepartments: audience === "all" ? [] : [audience],
    };
  }

  if (parsed.audienceKind === "department" || parsed.audienceKind === "users") {
    const { audienceDepartment, audienceKind: _oldKind, ...rest } = parsed;
    return {
      ...(rest as Partial<Draft>),
      audienceKind: "mixed",
      audienceDepartments: audienceDepartment ? [audienceDepartment] : [],
      audienceUserIds: rest.audienceUserIds ?? [],
    };
  }

  return parsed as Partial<Draft>;
}

export function audienceValueOf(draft: Draft): Audience {
  if (draft.audienceKind === "mixed") {
    return {
      kind: "mixed",
      departments: draft.audienceDepartments,
      userIds: draft.audienceUserIds as Id<"users">[],
    };
  }
  return { kind: "all" };
}
