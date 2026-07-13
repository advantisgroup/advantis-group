import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireAdmin, requireUser } from "./lib/auth";
import { type Audience, userMatchesAudience } from "./lib/audience";
import { notifyUsers } from "./lib/notify";
import { audienceValidator } from "./schema";

/**
 * Incidents/maintenance/changelog entries: a global banner + blog-post-style
 * detail page, replacing the one-shot WhatsNewDialog for changelogs and
 * adding incident.io-style status tracking + a company-wide email blast
 * (see updatesEmail.ts, which owns handing the send off to the Elysia API).
 */

const TERMINAL_STATUSES = new Set(["resolved", "completed", "cancelled"]);
const CHANGELOG_BANNER_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const RESOLVED_BANNER_GRACE_MS = 24 * 60 * 60 * 1000;

const statusValidator = v.union(
  v.literal("investigating"),
  v.literal("identified"),
  v.literal("monitoring"),
  v.literal("resolved"),
  v.literal("scheduled"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("cancelled")
);

const NOTIFY_TITLES: Record<Doc<"updates">["type"], string> = {
  incident: "New incident",
  maintenance: "Scheduled maintenance",
  changelog: "What's new",
};

function assertServerKey(serverKey: string) {
  const expected = process.env.CONVEX_SERVER_KEY;
  if (!expected || serverKey !== expected) {
    throw new ConvexError({ code: "forbidden", message: "Invalid server key" });
  }
}

function authorName(user: Doc<"users"> | null): string {
  if (!user) return "Unknown";
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
  );
}

async function resolveAudienceUserIds(
  ctx: MutationCtx,
  audience: Audience
): Promise<Id<"users">[]> {
  const all = await ctx.db
    .query("users")
    .withIndex("by_status", q => q.eq("status", "active"))
    .collect();
  return all.filter(u => userMatchesAudience(u, audience)).map(u => u._id);
}

/** Shared publish side effects: in-app notify now, or schedule for later. */
async function schedulePublishSideEffects(
  ctx: MutationCtx,
  update: Doc<"updates">
): Promise<void> {
  const now = Date.now();
  if (update.publishedAt > now) {
    await ctx.scheduler.runAt(update.publishedAt, internal.updates.publishScheduled, {
      updateId: update._id,
    });
    return;
  }
  const recipients = (await resolveAudienceUserIds(ctx, update.audience)).filter(
    uid => uid !== update.authorUserId
  );
  await notifyUsers(ctx, recipients, {
    type: `update:${update.type}`,
    title: NOTIFY_TITLES[update.type],
    body: update.title,
    link: `/updates/${update._id}`,
  });
  if (update.emailRequested) {
    await ctx.scheduler.runAfter(0, internal.updatesEmail.sendBulk, {
      updateId: update._id,
    });
  }
}

function defaultStatus(
  type: Doc<"updates">["type"]
): Doc<"updates">["status"] {
  if (type === "incident") return "investigating";
  if (type === "maintenance") return "scheduled";
  return undefined;
}

export const create = mutation({
  args: {
    type: v.union(
      v.literal("incident"),
      v.literal("maintenance"),
      v.literal("changelog")
    ),
    title: v.string(),
    summary: v.string(),
    bodyFormat: v.union(v.literal("richtext"), v.literal("markdown")),
    body: v.string(),
    audience: audienceValidator,
    guestVisible: v.optional(v.boolean()),
    affectedSystems: v.optional(v.array(v.string())),
    status: v.optional(statusValidator),
    startedAt: v.optional(v.number()),
    /** Future timestamp schedules the update instead of publishing now. */
    publishAt: v.optional(v.number()),
    emailRequested: v.boolean(),
  },
  handler: async (ctx, args) => {
    const author = await requireAdmin(ctx);
    const now = Date.now();
    const publishedAt = args.publishAt && args.publishAt > now ? args.publishAt : now;
    const id = await ctx.db.insert("updates", {
      type: args.type,
      title: args.title,
      summary: args.summary,
      bodyFormat: args.bodyFormat,
      body: args.body,
      authorUserId: author._id,
      audience: args.audience,
      guestVisible: args.guestVisible ?? false,
      affectedSystems: args.affectedSystems,
      status: args.status ?? defaultStatus(args.type),
      timeline: [],
      startedAt: args.startedAt ?? publishedAt,
      revision: 1,
      publishedAt,
      emailRequested: args.emailRequested,
      source: "ui",
      createdAt: now,
    });
    const update = await ctx.db.get(id);
    if (update) await schedulePublishSideEffects(ctx, update);
    return { id };
  },
});

/**
 * Server-key gated upsert-by-slug, invoked by `scripts/publish-update.ts` so
 * Claude (or anyone) can publish a changelog entry from a markdown file. A
 * second run of the same slug patches the existing row instead of
 * re-notifying/re-emailing everyone.
 */
export const publishFromMarkdown = mutation({
  args: {
    serverKey: v.string(),
    authorEmail: v.string(),
    slug: v.string(),
    type: v.union(
      v.literal("incident"),
      v.literal("maintenance"),
      v.literal("changelog")
    ),
    title: v.string(),
    summary: v.string(),
    body: v.string(),
    audience: audienceValidator,
    guestVisible: v.optional(v.boolean()),
    affectedSystems: v.optional(v.array(v.string())),
    status: v.optional(statusValidator),
    startedAt: v.optional(v.number()),
    publishAt: v.optional(v.number()),
    emailRequested: v.boolean(),
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const author = await ctx.db
      .query("users")
      .withIndex("by_email", q => q.eq("email", args.authorEmail.toLowerCase()))
      .unique();
    if (!author) {
      throw new ConvexError({
        code: "not_found",
        message: `No user found for authorEmail ${args.authorEmail}`,
      });
    }

    const existing = await ctx.db
      .query("updates")
      .withIndex("by_slug", q => q.eq("slug", args.slug))
      .unique();
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        summary: args.summary,
        body: args.body,
        audience: args.audience,
        guestVisible: args.guestVisible ?? existing.guestVisible,
        affectedSystems: args.affectedSystems ?? existing.affectedSystems,
        status: args.status ?? existing.status,
        revision: existing.revision + 1,
        updatedAt: now,
      });
      return { id: existing._id, updated: true };
    }

    const publishedAt = args.publishAt && args.publishAt > now ? args.publishAt : now;
    const id = await ctx.db.insert("updates", {
      type: args.type,
      slug: args.slug,
      title: args.title,
      summary: args.summary,
      bodyFormat: "markdown",
      body: args.body,
      authorUserId: author._id,
      audience: args.audience,
      guestVisible: args.guestVisible ?? false,
      affectedSystems: args.affectedSystems,
      status: args.status ?? defaultStatus(args.type),
      timeline: [],
      startedAt: args.startedAt ?? publishedAt,
      revision: 1,
      publishedAt,
      emailRequested: args.emailRequested,
      source: "markdown",
      createdAt: now,
    });
    const update = await ctx.db.get(id);
    if (update) await schedulePublishSideEffects(ctx, update);
    return { id, updated: false };
  },
});

/** Fired by the scheduler when a scheduled update's publish time lands. */
export const publishScheduled = internalMutation({
  args: { updateId: v.id("updates") },
  handler: async (ctx, { updateId }) => {
    const update = await ctx.db.get(updateId);
    if (!update || update.publishedAt > Date.now()) return;
    const recipients = (
      await resolveAudienceUserIds(ctx, update.audience)
    ).filter(uid => uid !== update.authorUserId);
    await notifyUsers(ctx, recipients, {
      type: `update:${update.type}`,
      title: NOTIFY_TITLES[update.type],
      body: update.title,
      link: `/updates/${updateId}`,
    });
    if (update.emailRequested) {
      await ctx.scheduler.runAfter(0, internal.updatesEmail.sendBulk, { updateId });
    }
  },
});

/** Post a status/timeline entry — the incident.io-style running log. No email. */
export const addTimelineEntry = mutation({
  args: {
    updateId: v.id("updates"),
    status: v.optional(statusValidator),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const update = await ctx.db.get(args.updateId);
    if (!update) {
      throw new ConvexError({ code: "not_found", message: "Not found" });
    }
    const now = Date.now();
    const timeline = [
      ...(update.timeline ?? []),
      { at: now, status: args.status, message: args.message, authorUserId: user._id },
    ];
    const patch: Record<string, unknown> = { timeline, updatedAt: now };
    if (args.status) {
      patch.status = args.status;
      patch.revision = update.revision + 1;
      if (TERMINAL_STATUSES.has(args.status)) patch.resolvedAt = now;
    }
    await ctx.db.patch(args.updateId, patch);

    const recipients = (
      await resolveAudienceUserIds(ctx, update.audience)
    ).filter(uid => uid !== user._id);
    await notifyUsers(ctx, recipients, {
      type: `update:${update.type}`,
      title: `${update.title} — update`,
      body: args.message,
      link: `/updates/${args.updateId}`,
    });
    return { ok: true };
  },
});

export const update = mutation({
  args: {
    updateId: v.id("updates"),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    body: v.optional(v.string()),
    audience: v.optional(audienceValidator),
    guestVisible: v.optional(v.boolean()),
    affectedSystems: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { updateId, ...patch }) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.get(updateId);
    if (!existing) {
      throw new ConvexError({ code: "not_found", message: "Not found" });
    }
    await ctx.db.patch(updateId, { ...patch, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { updateId: v.id("updates") },
  handler: async (ctx, { updateId }) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.get(updateId);
    if (!existing) return { ok: false };
    const dismissals = await ctx.db
      .query("updateDismissals")
      .withIndex("by_update_user", q => q.eq("updateId", updateId))
      .collect();
    await Promise.all(dismissals.map(d => ctx.db.delete(d._id)));
    const emailRows = await ctx.db
      .query("updateEmailRecipients")
      .withIndex("by_update", q => q.eq("updateId", updateId))
      .collect();
    await Promise.all(emailRows.map(r => ctx.db.delete(r._id)));
    await ctx.db.delete(updateId);
    return { ok: true };
  },
});

export const list = query({
  args: {
    type: v.optional(
      v.union(v.literal("incident"), v.literal("maintenance"), v.literal("changelog"))
    ),
    status: v.optional(statusValidator),
    affectedSystem: v.optional(v.string()),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const rows = args.type
      ? await ctx.db
          .query("updates")
          .withIndex("by_type_publishedAt", q => q.eq("type", args.type!))
          .order("desc")
          .take(args.limit ?? 200)
      : await ctx.db
          .query("updates")
          .withIndex("by_publishedAt")
          .order("desc")
          .take(args.limit ?? 200);

    const search = args.search?.trim().toLowerCase();
    const isAdmin = user.role === "admin";
    const visible = rows.filter(u => {
      if (!userMatchesAudience(user, u.audience)) return false;
      if (u.publishedAt > now && u.authorUserId !== user._id && !isAdmin) return false;
      if (args.status && u.status !== args.status) return false;
      if (args.affectedSystem && !(u.affectedSystems ?? []).includes(args.affectedSystem)) {
        return false;
      }
      if (
        search &&
        !u.title.toLowerCase().includes(search) &&
        !u.summary.toLowerCase().includes(search)
      ) {
        return false;
      }
      return true;
    });

    return Promise.all(
      visible.map(async u => {
        const author = await ctx.db.get(u.authorUserId);
        const ongoing = !!u.status && !TERMINAL_STATUSES.has(u.status);
        const durationMs = u.status
          ? (u.resolvedAt ?? now) - u.startedAt
          : null;
        return {
          _id: u._id,
          type: u.type,
          title: u.title,
          summary: u.summary,
          status: u.status ?? null,
          affectedSystems: u.affectedSystems ?? [],
          startedAt: u.startedAt,
          resolvedAt: u.resolvedAt ?? null,
          publishedAt: u.publishedAt,
          scheduled: u.publishedAt > now,
          ongoing,
          durationMs,
          authorName: authorName(author),
        };
      })
    );
  },
});

interface EmailRecipientRow {
  userId: Id<"users">;
  name: string;
  email: string;
  status: Doc<"updateEmailRecipients">["status"];
  sentAt: number | null;
  deliveredAt: number | null;
  openedAt: number | null;
  clickedAt: number | null;
}

export const get = query({
  args: { updateId: v.id("updates") },
  handler: async (ctx, { updateId }) => {
    const user = await requireUser(ctx);
    const update = await ctx.db.get(updateId);
    if (!update || !userMatchesAudience(user, update.audience)) {
      throw new ConvexError({ code: "not_found", message: "Not found" });
    }
    const author = await ctx.db.get(update.authorUserId);
    const timeline = await Promise.all(
      (update.timeline ?? []).map(async entry => {
        const entryAuthor = await ctx.db.get(entry.authorUserId);
        return { ...entry, authorName: authorName(entryAuthor) };
      })
    );
    const isAdmin = user.role === "admin";

    let emailStats: Record<string, number> | null = null;
    let recipients: EmailRecipientRow[] | null = null;
    if (isAdmin) {
      const rows = await ctx.db
        .query("updateEmailRecipients")
        .withIndex("by_update", q => q.eq("updateId", updateId))
        .collect();
      emailStats = rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {});
      recipients = await Promise.all(
        rows.map(async r => {
          const u = await ctx.db.get(r.userId);
          return {
            userId: r.userId,
            name: authorName(u),
            email: r.email,
            status: r.status,
            sentAt: r.sentAt ?? null,
            deliveredAt: r.deliveredAt ?? null,
            openedAt: r.openedAt ?? null,
            clickedAt: r.clickedAt ?? null,
          };
        })
      );
    }

    return {
      _id: update._id,
      type: update.type,
      title: update.title,
      summary: update.summary,
      bodyFormat: update.bodyFormat,
      body: update.body,
      status: update.status ?? null,
      affectedSystems: update.affectedSystems ?? [],
      audience: update.audience,
      startedAt: update.startedAt,
      resolvedAt: update.resolvedAt ?? null,
      publishedAt: update.publishedAt,
      scheduled: update.publishedAt > Date.now(),
      authorName: authorName(author),
      authorId: update.authorUserId,
      timeline,
      isAdmin,
      canEdit: isAdmin,
      emailRequested: update.emailRequested,
      emailSentAt: update.emailSentAt ?? null,
      emailStats,
      recipients,
    };
  },
});

export const bannerActive = query({
  args: {},
  handler: async ctx => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const recent = await ctx.db
      .query("updates")
      .withIndex("by_publishedAt")
      .order("desc")
      .take(50);

    const dismissals = await ctx.db
      .query("updateDismissals")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .collect();
    const dismissedRevisionByUpdate = new Map(
      dismissals.map(d => [d.updateId, d.dismissedRevision])
    );

    const candidates = recent.filter(u => {
      if (u.publishedAt > now) return false;
      if (!userMatchesAudience(user, u.audience)) return false;
      const dismissedRev = dismissedRevisionByUpdate.get(u._id);
      if (dismissedRev !== undefined && u.revision <= dismissedRev) return false;
      if (u.type === "changelog") {
        return now - u.publishedAt <= CHANGELOG_BANNER_WINDOW_MS;
      }
      const terminal = !!u.status && TERMINAL_STATUSES.has(u.status);
      if (!terminal) return true;
      return !!u.resolvedAt && now - u.resolvedAt <= RESOLVED_BANNER_GRACE_MS;
    });

    function priority(u: Doc<"updates">): number {
      const terminal = !!u.status && TERMINAL_STATUSES.has(u.status);
      if (u.type === "incident") return terminal ? 2 : 0;
      if (u.type === "maintenance") return terminal ? 3 : 1;
      return 4;
    }
    candidates.sort(
      (a, b) => priority(a) - priority(b) || b.publishedAt - a.publishedAt
    );

    if (candidates.length === 0) return { top: null, moreCount: 0 };
    const top = candidates[0];
    return {
      top: {
        _id: top._id,
        type: top.type,
        title: top.title,
        summary: top.summary,
        status: top.status ?? null,
      },
      moreCount: candidates.length - 1,
    };
  },
});

export const dismissBanner = mutation({
  args: { updateId: v.id("updates") },
  handler: async (ctx, { updateId }) => {
    const user = await requireUser(ctx);
    const update = await ctx.db.get(updateId);
    if (!update) return { ok: false };
    const existing = await ctx.db
      .query("updateDismissals")
      .withIndex("by_update_user", q =>
        q.eq("updateId", updateId).eq("userId", user._id)
      )
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { dismissedRevision: update.revision, dismissedAt: now });
    } else {
      await ctx.db.insert("updateDismissals", {
        updateId,
        userId: user._id,
        dismissedRevision: update.revision,
        dismissedAt: now,
      });
    }
    return { ok: true };
  },
});

/** Called by updatesEmail.sendBulk once the Elysia API reports send results. */
export const recordEmailSendResults = internalMutation({
  args: {
    updateId: v.id("updates"),
    results: v.array(
      v.object({
        userId: v.id("users"),
        email: v.string(),
        resendEmailId: v.optional(v.string()),
        failed: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, { updateId, results }) => {
    const now = Date.now();
    for (const r of results) {
      await ctx.db.insert("updateEmailRecipients", {
        updateId,
        userId: r.userId,
        email: r.email,
        resendEmailId: r.resendEmailId,
        status: r.failed ? "failed" : "sent",
        sentAt: r.failed ? undefined : now,
        lastEventAt: now,
      });
    }
    const update = await ctx.db.get(updateId);
    if (update) await ctx.db.patch(updateId, { emailSentAt: now });
    return { ok: true };
  },
});

const EVENT_STATUS_RANK: Record<string, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
  bounced: 5,
  complained: 5,
  failed: 5,
};

/** Server-key gated: called by the Elysia API's Resend webhook handler. */
export const recordEmailEvent = mutation({
  args: {
    serverKey: v.string(),
    resendEmailId: v.optional(v.string()),
    updateId: v.optional(v.id("updates")),
    userId: v.optional(v.id("users")),
    eventType: v.string(),
    occurredAt: v.number(),
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);

    let row = args.resendEmailId
      ? await ctx.db
          .query("updateEmailRecipients")
          .withIndex("by_resendEmailId", q => q.eq("resendEmailId", args.resendEmailId))
          .unique()
      : null;
    if (!row && args.updateId && args.userId) {
      row = await ctx.db
        .query("updateEmailRecipients")
        .withIndex("by_update_user", q =>
          q.eq("updateId", args.updateId!).eq("userId", args.userId!)
        )
        .first();
    }
    if (!row) return { updated: false };

    const statusByEvent: Record<string, keyof typeof EVENT_STATUS_RANK> = {
      "email.delivered": "delivered",
      "email.opened": "opened",
      "email.clicked": "clicked",
      "email.bounced": "bounced",
      "email.complained": "complained",
    };
    const nextStatus = statusByEvent[args.eventType];
    const patch: Record<string, unknown> = { lastEventAt: args.occurredAt };
    if (nextStatus && EVENT_STATUS_RANK[nextStatus] >= EVENT_STATUS_RANK[row.status]) {
      patch.status = nextStatus;
      if (nextStatus === "delivered") patch.deliveredAt = args.occurredAt;
      if (nextStatus === "opened") patch.openedAt = args.occurredAt;
      if (nextStatus === "clicked") patch.clickedAt = args.occurredAt;
    }
    await ctx.db.patch(row._id, patch);
    return { updated: true };
  },
});
