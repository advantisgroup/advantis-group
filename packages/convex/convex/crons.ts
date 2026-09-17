import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

/**
 * Scheduled jobs. ActivityTrack polls Genesys + Clockodo and folds the results
 * into the fused employee state, plus daily retention pruning. Convex crons run
 * on the free tier and can fire frequently. Adjust the schedule to your team's
 * hours / timezone.
 *
 * This file deploys unchanged to *every* Convex deployment: prod, every
 * `npx convex dev` deployment, and every branch's Vercel preview deployment
 * (one per branch, see scripts/vercel-preview-convex-build.sh, redeployed on
 * every preview build). Without a guard, every preview/dev backend ran this
 * exact schedule around the clock too — a handful of idle preview
 * environments together outweighed prod's own I/O.
 *
 * Set `DISABLE_CRONS=true` as a project default env var for the "preview" and
 * "dev" deployment types so only production actually schedules jobs:
 *   npx convex env default set DISABLE_CRONS true --type preview
 *   npx convex env default set DISABLE_CRONS true --type dev
 * (or Project Settings > Environment Variables in the dashboard). Defaults
 * only seed *new* deployments, so any preview deployment that already exists
 * needs the var set directly:
 *   npx convex env set DISABLE_CRONS true --preview-name <branch>
 * Production is intentionally left unset (falls through to crons running),
 * so this can't accidentally strip prod's schedule on deploy.
 */
const crons = cronJobs();

if (process.env.DISABLE_CRONS !== "true") {
  // Poll integrations around the clock, every day. The webhooks are the fast
  // path for state changes; this poll is the safety net that keeps the fused
  // state honest when a webhook is slow, misconfigured, or disabled server-side
  // (which has happened) — a webhook-only gap used to leave people frozen in
  // whatever state they were last seen in (e.g. "clocked in and working" hours
  // after they actually clocked out). Since webhooks carry most of the
  // freshness, a relaxed cadence suffices: every 15 min during the day, every
  // 2 h overnight where less changes but staleness still must resolve
  // eventually — the off-hours pass is also what lets the 20:00 "assumed →
  // certain clocked-out" transition (see clockodo.ts) fire in the evening
  // instead of depending on a webhook that may not be there.
  crons.cron(
    "activity: poll integrations (daytime)",
    "*/15 5-18 * * *",
    internal.activity.integrations.pollAll,
    {},
  );
  crons.cron(
    "activity: poll integrations (midnight)",
    "0 0 * * *",
    internal.activity.integrations.pollAll,
    {},
  );

  // Mirrors the latest published desktop-agent version so the overview can
  // flag devices that haven't updated yet.
  crons.hourly(
    "activity: refresh latest agent version",
    { minuteUTC: 50 },
    internal.activity.agentVersion.refreshLatestAgentVersion,
    {},
  );

  crons.daily(
    "activity: prune old raw samples",
    { hourUTC: 3, minuteUTC: 0 },
    internal.activity.maintenance.pruneOldSamples,
    {},
  );

  // Backfills the completed-month badge cache (performanceBadgeCache) so
  // teamDashboard/employeeDetail stop recomputing every completed month's team
  // totals from scratch on every request — a completed month's badges never
  // change, so this only ever has new months (the one that just closed) to do.
  crons.daily(
    "performance: cache completed month badges",
    { hourUTC: 3, minuteUTC: 5 },
    internal.performanceQueries.cacheCompletedMonthBadges,
    {},
  );

  crons.daily(
    "activity: prune old state history",
    { hourUTC: 3, minuteUTC: 15 },
    internal.activity.maintenance.pruneOldStateSamples,
    {},
  );

  crons.daily(
    "activity: prune old resolved events",
    { hourUTC: 3, minuteUTC: 30 },
    internal.activity.events.purgeOldEvents,
    {},
  );

  crons.daily(
    "clockodo: prune old webhook delivery log",
    { hourUTC: 3, minuteUTC: 45 },
    internal.clockodoWebhookLog.pruneOldWebhookLogs,
    {},
  );

  // Spent/expired reset tokens and long-settled requests. The audit trail
  // (passwordResetAuditLog) is deliberately not touched — it outlives both.
  crons.daily(
    "password resets: purge stale tokens and requests",
    { hourUTC: 3, minuteUTC: 50 },
    internal.passwordResets.purgeStale,
    {},
  );

  crons.daily(
    "ai runs: prune runs older than 30 days",
    { hourUTC: 4, minuteUTC: 20 },
    internal.aiRuns.pruneOld,
    {},
  );

  crons.daily(
    "drafts: prune drafts untouched for 60 days",
    { hourUTC: 4, minuteUTC: 25 },
    internal.drafts.pruneOld,
    {},
  );

  crons.hourly(
    "passkeys: purge expired challenges",
    { minuteUTC: 55 },
    internal.passkeys.purgeExpiredChallenges,
    {},
  );

  crons.daily(
    "step-up: purge stale known-device rows",
    { hourUTC: 4, minuteUTC: 10 },
    internal.stepUp.purgeStaleDevices,
    {},
  );

  // Auto-links Performance/Academy logins to their intranet account by email
  // for rows created before this existed, or whose matching account showed
  // up later — see docs/future-features/21_auth-consolidation.md's Phase 1.
  crons.daily(
    "performance: reconcile auto-links",
    { hourUTC: 4, minuteUTC: 15 },
    internal.performanceAuth.reconcileAutoLinks,
    {},
  );

  crons.daily(
    "academy: reconcile auto-links",
    { hourUTC: 4, minuteUTC: 18 },
    internal.academyParticipants.reconcileAutoLinks,
    {},
  );

  // Keep the OneDrive change-notification subscription fresh (renew well within
  // its expiry) so the file-listing cache invalidates promptly on changes.
  crons.daily(
    "onedrive: renew change subscription",
    { hourUTC: 4, minuteUTC: 0 },
    internal.onedrive.renewSubscription,
    {},
  );

  // Delete DMs abandoned by one side once their 48h grace window elapses without
  // a rejoin. Runs hourly so the "auto-deletes in …" countdown stays honest.
  crons.daily(
    "notifications: send daily digests",
    { hourUTC: 5, minuteUTC: 30 },
    internal.notifications.queueDailyDigests,
    {},
  );

  crons.weekly(
    "notifications: send weekly manager reports",
    { dayOfWeek: "monday", hourUTC: 5, minuteUTC: 45 },
    internal.notifications.queueWeeklyReports,
    {},
  );

  crons.hourly(
    "chat: purge expired left DMs",
    { minuteUTC: 20 },
    internal.chat.purgeExpiredDms,
    {},
  );
}

export default crons;
