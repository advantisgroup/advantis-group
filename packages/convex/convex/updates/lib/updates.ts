import { internal } from "../../_generated/api";
import { type Doc, type Id } from "../../_generated/dataModel";
import { type MutationCtx } from "../../_generated/server";
import { type Audience, userMatchesAudience } from "../../lib/audience";
import { notifyUsers } from "../../lib/notify";

/**
 * Incidents/maintenance/changelog entries: a global banner + blog-post-style
 * detail page, replacing the one-shot WhatsNewDialog for changelogs and
 * adding incident.io-style status tracking + a company-wide email blast
 * (see updatesEmail.ts, which owns handing the send off to the Elysia API).
 */

export const TERMINAL_STATUSES = new Set(["resolved", "completed", "cancelled"]);

export const NOTIFY_TITLES: Record<Doc<"updates">["type"], string> = {
  incident: "New incident",
  maintenance: "Scheduled maintenance",
  changelog: "What's new",
};

export async function resolveAudienceUserIds(
  ctx: MutationCtx,
  audience: Audience,
): Promise<Id<"users">[]> {
  const all = await ctx.db
    .query("users")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .collect();

  console.info(
    "all:",
    all.map((a) => a._id),
  );

  const filtered = all.filter((u) => userMatchesAudience(u, audience)).map((u) => u._id);
  console.info("filtered:", filtered);
  return filtered;
}

/** Shared publish side effects: in-app notify now, or schedule for later. */
export async function schedulePublishSideEffects(
  ctx: MutationCtx,
  update: Doc<"updates">,
): Promise<void> {
  const now = Date.now();
  if (update.publishedAt > now) {
    console.info("scheduling publish");
    await ctx.scheduler.runAt(update.publishedAt, internal.updates.updates.publishScheduled, {
      updateId: update._id,
    });
    return;
  }
  console.info("sending publish");
  const recipients = await resolveAudienceUserIds(ctx, update.audience);
  console.info("sending publish to", recipients);
  await notifyUsers(ctx, recipients, {
    type: `update:${update.type}`,
    title: NOTIFY_TITLES[update.type],
    body: update.title,
    link: `/updates/${update._id}`,
  });
  if (update.emailRequested) {
    const res = await ctx.scheduler.runAfter(10000, internal.updates.email.sendBulk, {
      updateId: update._id,
    });
    console.info("schedulePublishSideEffects", res);
  }
}

export function defaultStatus(type: Doc<"updates">["type"]): Doc<"updates">["status"] {
  if (type === "incident") return "investigating";
  if (type === "maintenance") return "scheduled";
  return undefined;
}

export interface InsertUpdateArgs {
  type: Doc<"updates">["type"];
  slug?: string;
  title: string;
  summary: string;
  bodyFormat: Doc<"updates">["bodyFormat"];
  body: string;
  authorUserId: Id<"users">;
  audience: Audience;
  affectedSystems?: string[];
  status?: Doc<"updates">["status"];
  startedAt?: number;
  /** Future timestamp schedules the update instead of publishing now. */
  publishAt?: number;
  emailRequested: boolean;
  source: Doc<"updates">["source"];
}

/**
 * Shared insert + publish-side-effects logic behind every way an Update gets
 * created — the `/updates/new` UI form, the markdown publish script, and
 * system-generated posts like a feature-flag toggle — so they can't drift.
 */
export async function insertUpdate(
  ctx: MutationCtx,
  args: InsertUpdateArgs,
): Promise<Id<"updates">> {
  const now = Date.now();
  const publishedAt = args.publishAt && args.publishAt > now ? args.publishAt : now;
  const id = await ctx.db.insert("updates", {
    type: args.type,
    slug: args.slug,
    title: args.title,
    summary: args.summary,
    bodyFormat: args.bodyFormat,
    body: args.body,
    authorUserId: args.authorUserId,
    audience: args.audience,
    affectedSystems: args.affectedSystems,
    status: args.status ?? defaultStatus(args.type),
    timeline: [],
    startedAt: args.startedAt ?? publishedAt,
    revision: 1,
    publishedAt,
    emailRequested: args.emailRequested,
    source: args.source,
    createdAt: now,
  });
  const update = await ctx.db.get(id);
  if (update) await schedulePublishSideEffects(ctx, update);
  return id;
}

export interface AppendTimelineArgs {
  authorUserId: Id<"users">;
  status?: Doc<"updates">["status"];
  message: string;
}

/**
 * Shared "post a follow-up" logic behind `addTimelineEntry` and
 * system-generated follow-ups (e.g. a feature flag re-enabling closing out
 * the post it made when it was disabled). No email — only the initial
 * publish sends one, to avoid inbox spam mid-incident.
 */
export async function appendTimeline(
  ctx: MutationCtx,
  updateId: Id<"updates">,
  args: AppendTimelineArgs,
): Promise<void> {
  const update = await ctx.db.get(updateId);
  if (!update) return;
  const now = Date.now();
  const timeline = [
    ...(update.timeline ?? []),
    {
      at: now,
      status: args.status,
      message: args.message,
      authorUserId: args.authorUserId,
    },
  ];
  const patch: Record<string, unknown> = { timeline, updatedAt: now };
  if (args.status) {
    patch.status = args.status;
    patch.revision = update.revision + 1;
    if (TERMINAL_STATUSES.has(args.status)) patch.resolvedAt = now;
  }
  await ctx.db.patch(updateId, patch);

  const recipients = (await resolveAudienceUserIds(ctx, update.audience)).filter(
    (uid) => uid !== args.authorUserId,
  );
  await notifyUsers(ctx, recipients, {
    type: `update:${update.type}`,
    title: `${update.title} — update`,
    body: args.message,
    link: `/updates/${updateId}`,
  });
}
