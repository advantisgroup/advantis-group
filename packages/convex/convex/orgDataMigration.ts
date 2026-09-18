import { mutation, query } from "./functions";
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

/**
 * One-time cleanup of the free-text `users.department`/`users.teams` into
 * real `departments`/`teams` rows. Unlike the ActivityTrack import
 * (`activity/migration*.ts`), this reads a single, same-deployment table
 * that's small enough (one row per employee) to scan and write in ordinary
 * mutations — no cross-deployment paging or resumable cursor is needed here.
 *
 * Flow: `populateReview` groups every raw value by
 * `trim().toLowerCase()`; an admin reviews/renames/merges/rejects buckets via
 * `setCanonicalName` / `mergeBucket` / `setStatus`; `runBackfill` then
 * creates one `departments`/`teams` row per approved bucket and backfills
 * every matching user. Idempotent — safe to re-run at any step.
 */

const kindArg = v.union(v.literal("department"), v.literal("team"));

function normalize(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Scan `users` and (re-)populate the review queue from current raw values. */
export const populateReview = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();

    const buckets = new Map<
      string,
      { kind: "department" | "team"; normalized: string; raw: Set<string> }
    >();

    const add = (kind: "department" | "team", raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      const normalized = normalize(trimmed);
      const key = `${kind}:${normalized}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.raw.add(trimmed);
      } else {
        buckets.set(key, { kind, normalized, raw: new Set([trimmed]) });
      }
    };

    for (const u of users) {
      if (u.department) add("department", u.department);
      for (const t of u.teams ?? []) add("team", t);
    }

    let created = 0;
    let updated = 0;
    for (const bucket of buckets.values()) {
      const existing = await ctx.db
        .query("orgDataMigrationReview")
        .withIndex("by_kind_normalized", (q) =>
          q.eq("kind", bucket.kind).eq("normalized", bucket.normalized),
        )
        .unique();
      const rawValues = [...bucket.raw].sort();
      if (existing) {
        // Only widen rawValues (new spellings seen since the last scan) —
        // never touch a canonicalName/status a reviewer already set.
        const merged = [...new Set([...existing.rawValues, ...rawValues])];
        if (merged.length !== existing.rawValues.length) {
          await ctx.db.patch(existing._id, {
            rawValues: merged,
            updatedAt: Date.now(),
          });
          updated++;
        }
      } else {
        await ctx.db.insert("orgDataMigrationReview", {
          kind: bucket.kind,
          normalized: bucket.normalized,
          rawValues,
          canonicalName: rawValues[0],
          status: "pending",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        created++;
      }
    }

    return { created, updated, scanned: users.length };
  },
});

export const listReview = query({
  args: { kind: kindArg },
  handler: async (ctx, { kind }) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("orgDataMigrationReview")
      .withIndex("by_kind_normalized", (q) => q.eq("kind", kind))
      .collect();
    return rows.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  },
});

export const setCanonicalName = mutation({
  args: { bucketId: v.id("orgDataMigrationReview"), canonicalName: v.string() },
  handler: async (ctx, { bucketId, canonicalName }) => {
    await requireAdmin(ctx);
    const trimmed = canonicalName.trim();
    if (!trimmed) {
      throw new ConvexError({
        code: "bad_request",
        message: "Canonical name cannot be empty",
      });
    }
    await ctx.db.patch(bucketId, {
      canonicalName: trimmed,
      updatedAt: Date.now(),
    });
  },
});

export const setStatus = mutation({
  args: {
    bucketId: v.id("orgDataMigrationReview"),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
  },
  handler: async (ctx, { bucketId, status }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(bucketId, { status, updatedAt: Date.now() });
  },
});

/** Merge `sourceId` into `targetId` (same kind) — never automatic. */
export const mergeBucket = mutation({
  args: {
    sourceId: v.id("orgDataMigrationReview"),
    targetId: v.id("orgDataMigrationReview"),
  },
  handler: async (ctx, { sourceId, targetId }) => {
    await requireAdmin(ctx);
    if (sourceId === targetId) {
      throw new ConvexError({
        code: "bad_request",
        message: "Cannot merge a bucket into itself",
      });
    }
    const [source, target] = await Promise.all([ctx.db.get(sourceId), ctx.db.get(targetId)]);
    if (!source || !target) {
      throw new ConvexError({ code: "not_found", message: "Bucket not found" });
    }
    if (source.kind !== target.kind) {
      throw new ConvexError({
        code: "bad_request",
        message: "Cannot merge a department bucket into a team bucket",
      });
    }
    const mergedRaw = [...new Set([...target.rawValues, ...source.rawValues])];
    await ctx.db.patch(target._id, {
      rawValues: mergedRaw,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(source._id, {
      mergedIntoId: target._id,
      status: "approved",
      updatedAt: Date.now(),
    });
  },
});

/** Every raw value that should resolve to `bucket` — its own plus any merged into it. */
async function rawValuesForBackfill(
  ctx: MutationCtx,
  bucket: Doc<"orgDataMigrationReview">,
): Promise<Set<string>> {
  const merged = await ctx.db
    .query("orgDataMigrationReview")
    .withIndex("by_kind_normalized", (q) => q.eq("kind", bucket.kind))
    .filter((q) => q.eq(q.field("mergedIntoId"), bucket._id))
    .collect();
  const values = new Set(bucket.rawValues.map(normalize));
  for (const m of merged) {
    for (const raw of m.rawValues) values.add(normalize(raw));
  }
  return values;
}

/**
 * Create one `departments`/`teams` row per approved, un-merged bucket, then
 * backfill `users.departmentId` / `userTeams` for every user whose raw value
 * falls in that bucket. Idempotent: buckets that already have a
 * `materializedDepartmentId`/`materializedTeamId` are skipped, and a user
 * already carrying the right `departmentId`/`userTeams` row is left alone.
 */
export const runBackfill = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    const approved = await ctx.db
      .query("orgDataMigrationReview")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();
    const toMaterialize = approved.filter((b) => b.mergedIntoId === undefined);
    const pendingUnreviewed = await ctx.db
      .query("orgDataMigrationReview")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    if (pendingUnreviewed.length > 0) {
      throw new ConvexError({
        code: "bad_request",
        message: `${pendingUnreviewed.length} bucket(s) still pending review — approve or reject them first`,
      });
    }

    const users = await ctx.db.query("users").collect();
    let departmentsCreated = 0;
    let teamsCreated = 0;
    let usersUpdated = 0;

    for (const bucket of toMaterialize) {
      if (bucket.kind === "department") {
        let departmentId = bucket.materializedDepartmentId;
        if (!departmentId) {
          departmentId = await ctx.db.insert("departments", {
            name: bucket.canonicalName,
            createdAt: Date.now(),
            createdBy: admin._id,
          });
          await ctx.db.patch(bucket._id, {
            materializedDepartmentId: departmentId,
            updatedAt: Date.now(),
          });
          departmentsCreated++;
        }
        const raw = await rawValuesForBackfill(ctx, bucket);
        for (const u of users) {
          if (u.department && raw.has(normalize(u.department)) && u.departmentId !== departmentId) {
            await ctx.db.patch(u._id, { departmentId });
            usersUpdated++;
          }
        }
      } else {
        let teamId = bucket.materializedTeamId;
        if (!teamId) {
          teamId = await ctx.db.insert("teams", {
            name: bucket.canonicalName,
            slug: bucket.normalized.replace(/[^a-z0-9]+/g, "-"),
            createdAt: Date.now(),
            createdBy: admin._id,
          });
          await ctx.db.patch(bucket._id, {
            materializedTeamId: teamId,
            updatedAt: Date.now(),
          });
          teamsCreated++;
        }
        const raw = await rawValuesForBackfill(ctx, bucket);
        for (const u of users) {
          if (!(u.teams ?? []).some((t) => raw.has(normalize(t)))) continue;
          const existingLink = await ctx.db
            .query("userTeams")
            .withIndex("by_user_team", (q) =>
              q.eq("userId", u._id).eq("teamId", teamId as Id<"teams">),
            )
            .unique();
          if (!existingLink) {
            await ctx.db.insert("userTeams", { userId: u._id, teamId });
            usersUpdated++;
          }
        }
      }
    }

    return { departmentsCreated, teamsCreated, usersUpdated };
  },
});

/**
 * Group 1 (clockodoUserId type unification) backfill: `users.clockodoUserId`
 * historically stored a `number`; the canonical type is now `string`
 * (matching `people.clockodoUserId` and Clockodo's own API — see
 * `lib/clockodoId.ts` and `schema.ts`). All writers already write `string`;
 * this one-time admin mutation normalizes any remaining legacy `number` rows
 * left over from before that change. Idempotent — safe to re-run.
 *
 * Once a run reports `remainingNumberRows: 0`, the schema's
 * `clockodoUserId: v.union(v.string(), v.number())` can be narrowed back to
 * `v.optional(v.string())` and this mutation (plus the legacy-number read
 * paths in `clockodoSync.ts` / `integrations/clockodoView.ts`) can be
 * deleted.
 */
export const backfillClockodoUserIdStrings = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    let updated = 0;
    for (const u of users) {
      if (typeof u.clockodoUserId === "number") {
        await ctx.db.patch(u._id, { clockodoUserId: String(u.clockodoUserId) });
        updated++;
      }
    }
    const remainingNumberRows = (await ctx.db.query("users").collect()).filter(
      (u) => typeof u.clockodoUserId === "number",
    ).length;
    return { updated, remainingNumberRows };
  },
});
