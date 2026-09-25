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
  // Poll integrations hourly during business hours, weekdays only. The
  // webhooks are the fast path for state changes; this poll is the safety
  // net that keeps the fused state honest when a webhook is slow, misconfigured,
  // or disabled server-side (which has happened) — a webhook-only gap used to
  // leave people frozen in whatever state they were last seen in (e.g.
  // "clocked in and working" hours after they actually clocked out).
  crons.cron(
    "activity: poll integrations",
    "0 7-20 * * 1-5",
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
    "marketing: anonymize website inquiries past their retention period",
    { hourUTC: 2, minuteUTC: 50 },
    internal.marketing.retention.anonymizeStale,
    {},
  );

  crons.daily(
    "hr: delete archived applicants past their retention period",
    { hourUTC: 2, minuteUTC: 40 },
    internal.hr.retention.purgeExpiredApplicants,
    {},
  );
  crons.daily(
    "files: forget upload claims older than a week",
    { hourUTC: 2, minuteUTC: 50 },
    internal.files.pruneUploadClaims,
    {},
  );
  crons.daily(
    "trash: purge items deleted over 30 days ago",
    { hourUTC: 2, minuteUTC: 30 },
    internal.org.trash.purgeExpired,
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
    internal.performance.queries.cacheCompletedMonthBadges,
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
    internal.integrations.clockodoWebhookLog.pruneOldWebhookLogs,
    {},
  );

  // Spent/expired reset tokens and long-settled requests. The audit trail
  // (passwordResetAuditLog) is deliberately not touched — it outlives both.
  crons.daily(
    "password resets: purge stale tokens and requests",
    { hourUTC: 3, minuteUTC: 50 },
    internal.security.passwordResets.purgeStale,
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
    internal.drafts.drafts.pruneOld,
    {},
  );

  crons.hourly(
    "passkeys: purge expired challenges",
    { minuteUTC: 55 },
    internal.security.passkeys.purgeExpiredChallenges,
    {},
  );

  crons.daily(
    "step-up: purge stale known-device rows",
    { hourUTC: 4, minuteUTC: 10 },
    internal.security.stepUp.purgeStaleDevices,
    {},
  );

  // Links Performance/Academy logins whose intranet account showed up later.
  crons.daily(
    "performance: reconcile auto-links",
    { hourUTC: 4, minuteUTC: 15 },
    internal.performance.auth.reconcileAutoLinks,
    {},
  );

  crons.daily(
    "academy: reconcile auto-links",
    { hourUTC: 4, minuteUTC: 18 },
    internal.academy.participants.reconcileAutoLinks,
    {},
  );

  // Keep the OneDrive change-notification subscription fresh (renew well within
  // its expiry) so the file-listing cache invalidates promptly on changes.
  crons.daily(
    "onedrive: renew change subscription",
    { hourUTC: 4, minuteUTC: 0 },
    internal.integrations.onedrive.renewSubscription,
    {},
  );

  // Delete DMs abandoned by one side once their 48h grace window elapses without
  // a rejoin. Runs hourly so the "auto-deletes in …" countdown stays honest.
  crons.daily(
    "notifications: send daily digests",
    { hourUTC: 5, minuteUTC: 30 },
    internal.notifications.notifications.queueDailyDigests,
    {},
  );

  crons.weekly(
    "notifications: send weekly manager reports",
    { dayOfWeek: "monday", hourUTC: 5, minuteUTC: 45 },
    internal.notifications.notifications.queueWeeklyReports,
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
