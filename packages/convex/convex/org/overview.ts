import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import { query, userQuery } from "../functions";
import type { QueryCtx } from "../_generated/server";
import { readConfig } from "../activity/lib/settings";
import { hasCapability } from "../lib/auth";
import { displayName } from "../lib/users";

/**
 * Read models for the `/admin` organization overview — the operational
 * control room for the whole intranet, not one subsystem's dashboard.
 *
 * Three queries rather than one, because they invalidate on wildly different
 * cadences and a single subscription would re-run all of it on every change:
 *
 * - `queue`   — pending work; changes whenever anyone files or resolves
 *               anything, so it stays small and index-scoped.
 * - `pulse`   — org composition + who's around; changes on presence
 *               heartbeats and member edits.
 * - `timelines` — per-day throughput history; only its tail bucket moves, so
 *               a fat re-read is acceptable at its low change rate.
 * - `systems` — integration/agent/flag health.
 *
 * Everything here is Managers+ (`requireManager`), matching the overview page
 * itself — the narrower capability holders the `/admin` layout lets in
 * (`manage_uploads`, `access_integrations`, …) land on their own subpage
 * instead. The two strictly-admin slices (password-reset queue, audit volume,
 * webhook diagnostics) are additionally gated inside their query and simply
 * omitted for a plain manager, rather than throwing and blanking the page.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Open IT tickets go stale rather than overdue — they carry no due date. */
const STALE_TICKET_MS = 14 * DAY_MS;

/** An active member who hasn't loaded the intranet in this long is dormant. */
const DORMANT_MS = 30 * DAY_MS;

/** An active agent whose last heartbeat is older than this is presumed dead. */
const AGENT_STALE_MS = DAY_MS;

/**
 * Start of the local day containing `at`, for a client-supplied
 * `Date#getTimezoneOffset()` value (minutes of UTC ahead of local, so Berlin
 * in summer sends -120). Convex has no timezone of its own, so day bucketing
 * has to be anchored on the viewer's offset or every boundary lands at UTC
 * midnight and "today" is wrong for two hours of every evening.
 */
function localDayStart(at: number, tzOffsetMinutes: number): number {
  const shift = tzOffsetMinutes * 60_000;
  return Math.floor((at - shift) / DAY_MS) * DAY_MS + shift;
}

function oldest(times: number[]): number | null {
  return times.length === 0 ? null : Math.min(...times);
}

interface QueueItem {
  /** Stable identifier the client maps to a label, icon and destination. */
  key: string;
  count: number;
  /** Age anchor for "waiting since" — null when the bucket is empty. */
  oldestAt: number | null;
  /** Subset that has blown a due date (or gone stale, for due-date-less work). */
  overdue: number;
}

function item(key: string, rows: { at: number; overdue: boolean }[]): QueueItem {
  return {
    key,
    count: rows.length,
    oldestAt: oldest(rows.map((r) => r.at)),
    overdue: rows.filter((r) => r.overdue).length,
  };
}

/**
 * Everything across the intranet that is waiting on a human, in one list.
 * The point of the overview is that a manager shouldn't have to visit nine
 * subpages to find out whether any of them needs them today.
 */
export const queue = userQuery({
  role: "manager",
  args: {},
  handler: async (ctx) => {
    const me = ctx.caller.user;
    const now = Date.now();
    const isAdmin = ctx.caller.role === "admin";

    const [
      accessRequests,
      invites,
      uploads,
      ticketsOpen,
      ticketsInProgress,
      errorsNew,
      errorsInProgress,
      measures,
      suggestions,
      resetRequests,
      orgDataReview,
    ] = await Promise.all([
      ctx.db
        .query("accessRequests")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .collect(),
      ctx.db
        .query("invites")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .collect(),
      ctx.db
        .query("onedriveUploads")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .collect(),
      ctx.db
        .query("itTickets")
        .withIndex("by_status_updatedAt", (q) => q.eq("status", "offen"))
        .collect(),
      ctx.db
        .query("itTickets")
        .withIndex("by_status_updatedAt", (q) => q.eq("status", "bearbeitung"))
        .collect(),
      ctx.db
        .query("errorReports")
        .withIndex("by_status", (q) => q.eq("status", "neu"))
        .collect(),
      ctx.db
        .query("errorReports")
        .withIndex("by_status", (q) => q.eq("status", "in_bearbeitung"))
        .collect(),
      ctx.db
        .query("errorMeasures")
        .withIndex("by_status", (q) => q.eq("status", "offen"))
        .collect(),
      // No status index on `suggestions`; the newest 1000 covers every
      // realistically-open one (the whole table is in the low hundreds) and
      // matches how `suggestions.list` already reads.
      ctx.db.query("suggestions").withIndex("by_createdAt").order("desc").take(1000),
      isAdmin
        ? ctx.db
            .query("passwordResetRequests")
            .withIndex("by_status_createdAt", (q) => q.eq("status", "pending"))
            .collect()
        : [],
      isAdmin
        ? ctx.db
            .query("orgDataMigrationReview")
            .withIndex("by_status", (q) => q.eq("status", "pending"))
            .collect()
        : [],
    ]);

    const openSuggestions = suggestions.filter(
      (s) => s.status === "open" || s.status === "in_discussion",
    );

    const items: QueueItem[] = [
      // Someone is locked out of the intranet until this is answered — the
      // one bucket where every row is treated as time-critical.
      item(
        "accessRequests",
        accessRequests.map((r) => ({ at: r.createdAt, overdue: now - r.createdAt > DAY_MS })),
      ),
      item(
        "invites",
        invites.map((i) => ({ at: i.createdAt, overdue: i.expiresAt < now })),
      ),
      item(
        "uploads",
        uploads.map((u) => ({ at: u.createdAt, overdue: now - u.createdAt > DAY_MS })),
      ),
      item(
        "itTickets",
        [...ticketsOpen, ...ticketsInProgress].map((t) => ({
          at: t.createdAt,
          overdue: now - t.createdAt > STALE_TICKET_MS,
        })),
      ),
      item(
        "errorReports",
        [...errorsNew, ...errorsInProgress].map((r) => ({
          at: r.createdAt,
          overdue: r.dueAt != null && r.dueAt < now,
        })),
      ),
      item(
        "errorMeasures",
        measures.map((m) => ({
          at: m.createdAt,
          overdue: m.dueAt != null && m.dueAt < now,
        })),
      ),
      item(
        "suggestions",
        openSuggestions.map((s) => ({ at: s.createdAt, overdue: false })),
      ),
      ...(isAdmin
        ? [
            item(
              "passwordResets",
              resetRequests.map((r) => ({
                at: r.createdAt,
                // Non-self-service means somebody asked about an account that
                // isn't theirs — an admin has to eyeball it, not just issue.
                overdue: !r.selfService || now - r.createdAt > DAY_MS,
              })),
            ),
            item(
              "orgDataReview",
              orgDataReview.map((r) => ({ at: r.createdAt, overdue: false })),
            ),
          ]
        : []),
    ].filter((i) => i.count > 0);

    return {
      items,
      total: items.reduce((sum, i) => sum + i.count, 0),
      overdue: items.reduce((sum, i) => sum + i.overdue, 0),
    };
  },
});

function departmentLabel(user: Doc<"users">, departmentNames: Map<string, string>): string | null {
  if (user.departmentId) return departmentNames.get(user.departmentId) ?? null;
  // Legacy free-text fallback, for rows the org-data backfill hasn't reached.
  return user.department?.trim() || null;
}

/** Org composition and who is around right now. */
export const pulse = userQuery({
  role: "manager",
  args: { tzOffsetMinutes: v.number() },
  handler: async (ctx, { tzOffsetMinutes }) => {
    const now = Date.now();
    const todayStart = localDayStart(now, tzOffsetMinutes);

    const [users, presenceRows, departments] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("presence").collect(),
      ctx.db.query("departments").collect(),
    ]);

    const departmentNames = new Map(
      departments.filter((d) => !d.archivedAt).map((d) => [d._id as string, d.name]),
    );
    const active = users.filter((u) => u.status === "active");

    // 5 minutes matches the sitewide presence heartbeat's own staleness
    // window — anything longer reads as "online" for people who closed the
    // tab minutes ago.
    const onlineCutoff = now - 5 * 60_000;
    const onlineUserIds = new Set(
      presenceRows.filter((p) => p.lastActiveAt > onlineCutoff).map((p) => p.userId as string),
    );

    const byDepartment = new Map<string, number>();
    let unassigned = 0;
    for (const u of active) {
      const label = departmentLabel(u, departmentNames);
      if (!label) unassigned++;
      else byDepartment.set(label, (byDepartment.get(label) ?? 0) + 1);
    }

    const summary = (u: Doc<"users">) => ({
      _id: u._id,
      name: displayName(u),
      email: u.email,
      role: u.role,
      department: departmentLabel(u, departmentNames),
      createdAt: u.createdAt,
      hireDate: u.hireDate ?? null,
      lastSeenAt: u.lastSeenAt ?? null,
    });

    const prevWindowStart = todayStart - 60 * DAY_MS;
    const windowStart = todayStart - 30 * DAY_MS;

    // Dormant vs. never-signed-in are deliberately separate: a licence nobody
    // has ever used is a provisioning mistake, while one that went quiet is an
    // offboarding one. Both are admin work, with different fixes.
    const dormant = active.filter((u) => u.lastSeenAt != null && u.lastSeenAt < now - DORMANT_MS);
    const neverSignedIn = active.filter(
      (u) => u.lastSeenAt == null && u.createdAt < now - 7 * DAY_MS,
    );

    const upcomingStarts = active
      .filter((u) => {
        if (!u.hireDate) return false;
        const at = Date.parse(`${u.hireDate}T00:00:00Z`);
        return Number.isFinite(at) && at >= todayStart && at <= todayStart + 30 * DAY_MS;
      })
      .sort((a, b) => (a.hireDate ?? "").localeCompare(b.hireDate ?? ""));

    return {
      headcount: {
        active: active.length,
        suspended: users.filter((u) => u.status === "suspended").length,
        external: active.filter((u) => u.external).length,
        admins: active.filter((u) => u.role === "admin").length,
        managers: active.filter((u) => u.role === "manager").length,
        employees: active.filter((u) => u.role === "employee").length,
      },
      onlineNow: active.filter((u) => onlineUserIds.has(u._id as string)).length,
      seenToday: active.filter((u) => (u.lastSeenAt ?? 0) >= todayStart).length,
      joinedWindow: active.filter((u) => u.createdAt >= windowStart).length,
      joinedPreviousWindow: active.filter(
        (u) => u.createdAt >= prevWindowStart && u.createdAt < windowStart,
      ).length,
      newest: active
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5)
        .map(summary),
      departments: [...byDepartment.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      unassignedDepartment: unassigned,
      dormant: { count: dormant.length, people: dormant.slice(0, 5).map(summary) },
      neverSignedIn: {
        count: neverSignedIn.length,
        people: neverSignedIn.slice(0, 5).map(summary),
      },
      upcomingStarts: upcomingStarts.slice(0, 5).map(summary),
    };
  },
});

/**
 * Per-series read cap. Applied newest-first (`order("desc")`) so a truncated
 * series loses its oldest buckets rather than its newest — the tail of the
 * chart, which is what anyone actually reads, always stays exact.
 */
const SERIES_CAP = 4000;

interface Series {
  key: string;
  points: number[];
  total: number;
  previousTotal: number;
}

function toSeries(
  key: string,
  times: number[],
  windowStart: number,
  days: number,
  tzOffsetMinutes: number,
): Series {
  const points = new Array<number>(days).fill(0);
  let previousTotal = 0;
  for (const at of times) {
    const bucket = Math.floor((localDayStart(at, tzOffsetMinutes) - windowStart) / DAY_MS);
    if (bucket >= 0 && bucket < days) points[bucket] += 1;
    else if (bucket >= -days && bucket < 0) previousTotal += 1;
  }
  return { key, points, total: points.reduce((a, b) => a + b, 0), previousTotal };
}

/**
 * Daily throughput across every system that files dated work, plus the
 * equivalent totals for the immediately preceding window of the same length
 * so each series can show a real delta instead of a bare count. Reads span
 * two windows for that reason.
 */
export const timelines = userQuery({
  role: "manager",
  args: { days: v.number(), tzOffsetMinutes: v.number() },
  handler: async (ctx, args) => {
    const me = ctx.caller.user;
    const isAdmin = ctx.caller.role === "admin";
    const days = Math.min(Math.max(Math.round(args.days), 7), 180);
    const now = Date.now();
    const tz = args.tzOffsetMinutes;

    const windowStart = localDayStart(now, tz) - (days - 1) * DAY_MS;
    // Inclusive lower bound of the *previous* window, so both halves come out
    // of one read per table.
    const readFrom = windowStart - days * DAY_MS;

    const [
      joined,
      ticketsOpened,
      ticketsClosed,
      errorsOpened,
      errorsClosed,
      suggestions,
      requests,
      uploads,
      announcements,
      updates,
      auditRows,
    ] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("by_createdAt", (q) => q.gte("createdAt", readFrom))
        .order("desc")
        .take(SERIES_CAP),
      ctx.db
        .query("itTickets")
        .withIndex("by_createdAt", (q) => q.gte("createdAt", readFrom))
        .order("desc")
        .take(SERIES_CAP),
      ctx.db
        .query("itTickets")
        .withIndex("by_status_updatedAt", (q) =>
          q.eq("status", "closed").gte("updatedAt", readFrom),
        )
        .order("desc")
        .take(SERIES_CAP),
      ctx.db
        .query("errorReports")
        .withIndex("by_createdAt", (q) => q.gte("createdAt", readFrom))
        .order("desc")
        .take(SERIES_CAP),
      ctx.db
        .query("errorReports")
        .withIndex("by_closedAt", (q) => q.gte("closedAt", readFrom))
        .order("desc")
        .take(SERIES_CAP),
      ctx.db
        .query("suggestions")
        .withIndex("by_createdAt", (q) => q.gte("createdAt", readFrom))
        .order("desc")
        .take(SERIES_CAP),
      ctx.db
        .query("accessRequests")
        .withIndex("by_createdAt", (q) => q.gte("createdAt", readFrom))
        .order("desc")
        .take(SERIES_CAP),
      ctx.db
        .query("onedriveUploads")
        .withIndex("by_createdAt", (q) => q.gte("createdAt", readFrom))
        .order("desc")
        .take(SERIES_CAP),
      ctx.db
        .query("announcements")
        .withIndex("by_publishedAt", (q) => q.gte("publishedAt", readFrom))
        .order("desc")
        .take(SERIES_CAP),
      ctx.db
        .query("updates")
        .withIndex("by_publishedAt", (q) => q.gte("publishedAt", readFrom))
        .order("desc")
        .take(SERIES_CAP),
      isAdmin
        ? ctx.db
            .query("auditLog")
            .withIndex("by_at", (q) => q.gte("at", readFrom))
            .order("desc")
            .take(SERIES_CAP)
        : [],
    ]);

    const series = (key: string, times: number[]) => toSeries(key, times, windowStart, days, tz);

    return {
      windowStart,
      days,
      series: [
        series(
          "ticketsOpened",
          ticketsOpened.map((t) => t.createdAt),
        ),
        series(
          "ticketsClosed",
          ticketsClosed.flatMap((t) => (t.updatedAt != null ? [t.updatedAt] : [])),
        ),
        series(
          "errorsOpened",
          errorsOpened.map((r) => r.createdAt),
        ),
        series(
          "errorsClosed",
          errorsClosed.flatMap((r) => (r.closedAt != null ? [r.closedAt] : [])),
        ),
        series(
          "suggestions",
          suggestions.map((s) => s.createdAt),
        ),
        series(
          "requests",
          requests.map((r) => r.createdAt),
        ),
        series(
          "uploads",
          uploads.map((u) => u.createdAt),
        ),
        series(
          "joined",
          joined.map((u) => u.createdAt),
        ),
        // Scheduled-for-later posts exist in both tables; counting them on
        // their future date would draw buckets ahead of today.
        series(
          "announcements",
          announcements.flatMap((a) => (a.publishedAt <= now ? [a.publishedAt] : [])),
        ),
        series(
          "updates",
          updates.flatMap((u) => (u.publishedAt <= now ? [u.publishedAt] : [])),
        ),
        ...(isAdmin
          ? [
              series(
                "adminActions",
                auditRows.map((r) => r.at),
              ),
            ]
          : []),
      ],
    };
  },
});

async function agentFleet(ctx: QueryCtx, now: number) {
  const config = await readConfig(ctx);
  const [activeDevices, pendingDevices] = await Promise.all([
    ctx.db
      .query("devices")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect(),
    ctx.db
      .query("devices")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect(),
  ]);

  const versions = new Map<string, number>();
  for (const d of activeDevices) {
    const key = d.agentVersion ?? "unknown";
    versions.set(key, (versions.get(key) ?? 0) + 1);
  }

  return {
    total: activeDevices.length,
    online: activeDevices.filter((d) => now - d.lastSeen < config.offlineThresholdSeconds * 1000)
      .length,
    stale: activeDevices.filter((d) => now - d.lastSeen > AGENT_STALE_MS).length,
    pending: pendingDevices.length,
    versions: [...versions.entries()]
      .map(([version, count]) => ({ version, count }))
      .sort((a, b) => b.count - a.count || a.version.localeCompare(b.version)),
  };
}

/** Integration, agent-fleet, killswitch and live-incident health. */
export const systems = userQuery({
  role: "manager",
  args: {},
  handler: async (ctx) => {
    const me = ctx.caller.user;
    const now = Date.now();
    const isAdmin = ctx.caller.role === "admin";
    const canSeeAgents = await hasCapability(ctx, "view_activity_admin");

    const [health, flags, publishedUpdates, webhookRows, agents] = await Promise.all([
      ctx.db.query("integrationHealth").collect(),
      ctx.db.query("featureFlags").collect(),
      ctx.db.query("updates").withIndex("by_publishedAt").order("desc").take(50),
      isAdmin ? ctx.db.query("clockodoWebhookLog").withIndex("by_at").order("desc").take(50) : [],
      canSeeAgents ? agentFleet(ctx, now) : null,
    ]);

    const live = publishedUpdates.filter(
      (u) =>
        u.publishedAt <= now &&
        ((u.type === "incident" && u.status !== "resolved") ||
          (u.type === "maintenance" && (u.status === "scheduled" || u.status === "in_progress"))),
    );

    const lastWebhook = webhookRows[0] ?? null;

    return {
      integrations: health
        .map((h) => ({
          source: h.source,
          status: h.status,
          message: h.message ?? null,
          lastOkAt: h.lastOkAt ?? null,
          lastErrorAt: h.lastErrorAt ?? null,
          updatedAt: h.updatedAt,
        }))
        .sort((a, b) => a.source.localeCompare(b.source)),
      agents,
      // Only the pulled killswitches are worth showing — an enabled flag is
      // the normal state and says nothing.
      disabledFlags: flags
        .filter((f) => !f.enabled)
        .map((f) => ({ key: f.key, reason: f.reason ?? null, updatedAt: f.updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt),
      flagsTotal: flags.length,
      liveUpdates: live.map((u) => ({
        _id: u._id,
        type: u.type,
        title: u.title,
        status: u.status ?? null,
        startedAt: u.startedAt,
      })),
      clockodoWebhook: isAdmin
        ? {
            lastAt: lastWebhook?.at ?? null,
            lastOk: lastWebhook?.ok ?? null,
            failures: webhookRows.filter((r) => !r.ok && r.at > now - DAY_MS).length,
          }
        : null,
    };
  },
});
