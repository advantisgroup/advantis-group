import { sandboxedMutation as mutation } from "./lib/sandbox";
import { v } from "convex/values";

import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";

const preferenceFields = {
  hiddenDashboardCards: v.optional(v.array(v.string())),
  dashboardCardOrder: v.optional(v.array(v.string())),
  dashboardDensity: v.optional(v.union(v.literal("comfortable"), v.literal("compact"))),
  defaultCalendarView: v.optional(
    v.union(v.literal("month"), v.literal("week"), v.literal("list")),
  ),
  startPage: v.optional(v.string()),
  weekStartsOn: v.optional(v.union(v.literal("monday"), v.literal("sunday"))),
  favoriteFolders: v.optional(v.array(v.string())),
  favoriteGuidebooks: v.optional(v.array(v.string())),
  savedDirectoryViews: v.optional(
    v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        department: v.string(),
        role: v.string(),
        team: v.string(),
        myTeamsOnly: v.boolean(),
        availableNow: v.boolean(),
        grouped: v.boolean(),
        view: v.union(v.literal("list"), v.literal("grid")),
      }),
    ),
  ),
  savedTicketViews: v.optional(
    v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        statusFilter: v.union(
          v.literal("alle"),
          v.literal("attention"),
          v.literal("unassigned"),
          v.literal("offen"),
          v.literal("bearbeitung"),
          v.literal("closed"),
        ),
        showAll: v.boolean(),
      }),
    ),
  ),
  savedApplicantViews: v.optional(
    v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        status: v.union(v.literal("alle"), v.literal("neu"), v.literal("pool")),
        rating: v.union(
          v.literal("alle"),
          v.literal("gruen"),
          v.literal("blau"),
          v.literal("rot"),
          v.literal("offen"),
        ),
        health: v.union(
          v.literal("alle"),
          v.literal("uncontacted"),
          v.literal("overdue"),
          v.literal("stale"),
        ),
      }),
    ),
  ),
  lastGuidebookSlug: v.optional(v.string()),
  dismissedWhatsNew: v.optional(v.string()),
  browserPushEnabled: v.optional(v.boolean()),
  onboardingStartedAt: v.optional(v.number()),
  onboardingCompletedAt: v.optional(v.number()),
  onboardingDismissedAt: v.optional(v.number()),
  onboardingStep: v.optional(v.number()),
  onboardingStepStatuses: v.optional(v.string()),
  designPreview: v.optional(v.union(v.literal("refreshed"), v.literal("classic"))),
  designFeedbackPromptedAt: v.optional(v.number()),
};

export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    return prefs ?? null;
  },
});

export const setMine = mutation({
  args: preferenceFields,
  handler: async (ctx, patch) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        ...patch,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

/**
 * Clears onboarding completion/dismissal so the wizard restarts from step 0
 * (Settings' "Restart onboarding" card). A dedicated mutation because `setMine`
 * only ever patches fields the caller explicitly sends — undefined values
 * passed from the client are dropped before reaching here, so there's no way
 * to *unset* `onboardingCompletedAt`/`onboardingDismissedAt` through it.
 */
export const resetOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const now = Date.now();
    const reset = {
      onboardingStartedAt: now,
      onboardingCompletedAt: undefined,
      onboardingDismissedAt: undefined,
      onboardingStep: 0,
      onboardingStepStatuses: undefined,
    };
    if (existing) {
      await ctx.db.patch(existing._id, { ...reset, updatedAt: now });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        ...reset,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});
