import type { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";

import type { FunctionReturnType } from "convex/server";

export type Announcement = FunctionReturnType<typeof api.announcements.list>[number];

export type Audience =
  | { kind: "all" }
  | { kind: "department"; department: string }
  | { kind: "users"; userIds: Id<"users">[] };

/** Sentinel value for the audience picker's "Specific people" option. */
export const USERS_AUDIENCE_VALUE = "__users__";
/** Sentinel for the feed toolbar's category filter — distinct from any
 * category value an admin could actually type (including one literally
 * named "all"). Reserved: `sanitizeCategory` strips it back out if someone
 * types this exact string, so it can never collide with real data. */
export const ALL_CATEGORIES_VALUE = "__all_categories__";
export const CATEGORY_MAX_LENGTH = 40;

export function sanitizeCategory(raw: string): string {
  const trimmed = raw.trim();
  return trimmed === ALL_CATEGORIES_VALUE ? "" : trimmed;
}

export interface Draft {
  title: string;
  body: string;
  pinned: boolean;
  guestVisible: boolean;
  category: string;
  audienceKind: "all" | "department" | "users";
  audienceDepartment: string;
  audienceUserIds: string[];
  publishAt: string;
  expiresAt: string;
}

export const EMPTY_DRAFT: Draft = {
  title: "",
  body: "",
  pinned: false,
  guestVisible: false,
  category: "",
  audienceKind: "all",
  audienceDepartment: "",
  audienceUserIds: [],
  publishAt: "",
  expiresAt: "",
};

export const DRAFT_KEY = "announcements:draft";

export function msToLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Autosaved drafts from before the audience picker gained "audienceKind" /
 * "audienceDepartment" stored a single `audience` string ("all" or a
 * department name) instead. Translate that old shape so a still-pending
 * draft doesn't silently lose its department targeting on restore.
 */
export function migrateStoredDraft(raw: unknown): Partial<Draft> {
  if (!raw || typeof raw !== "object") return {};
  const parsed = raw as Partial<Draft> & { audience?: string };
  if (parsed.audienceKind !== undefined || typeof parsed.audience !== "string") {
    return parsed;
  }
  const { audience, ...rest } = parsed;
  return {
    ...rest,
    audienceKind: audience === "all" ? "all" : "department",
    audienceDepartment: audience === "all" ? "" : audience,
  };
}

export function audienceValueOf(draft: Draft): Audience {
  if (draft.audienceKind === "department") {
    return { kind: "department", department: draft.audienceDepartment };
  }
  if (draft.audienceKind === "users") {
    return { kind: "users", userIds: draft.audienceUserIds as Id<"users">[] };
  }
  return { kind: "all" };
}
