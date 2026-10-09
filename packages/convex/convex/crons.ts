import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

/**
 * Scheduled jobs: retention pruning, digests and integration upkeep. Adjust
 * the schedule to your team's hours / timezone.
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
  crons.daily(
    "marketing: anonymize website inquiries past their retention period",
    { hourUTC: 2, minuteUTC: 50 },
    internal.marketing.retention.anonymizeStale,
    {},
  );

  crons.daily(
    "marketing: delete unconfirmed and long-withdrawn whitepaper requests",
    { hourUTC: 2, minuteUTC: 55 },
    internal.marketing.retention.purgeLeads,
    {},
  );

  crons.daily(
    "marketing: delete visitor statistics past their retention period",
    { hourUTC: 3, minuteUTC: 5 },
    internal.marketing.retention.purgeAnalytics,
    {},
  );

  // 05:15 Berlin in summer, 04:15 in winter — before anyone opens the inbox
  crons.daily(
    "marketing: close answered website inquiries the customer never came back to",
    { hourUTC: 3, minuteUTC: 15 },
    internal.marketing.automation.autoClose,
    {},
  );

  // Monday 06:50 UTC — before people start in Berlin, summer or winter time.
  crons.weekly(
    "digest: weekly what-you-missed email",
    { dayOfWeek: "monday", hourUTC: 6, minuteUTC: 50 },
    internal.digest.weekly.send,
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
  // Keeps the completed-month badge cache (performanceBadgeCache) current so
  // teamDashboard/employeeDetail don't recompute every past month per view.
  // Freezes a month from its 3rd day after month end (late call reports)
  // and recomputes one when a report of that month is imported later.
  crons.daily(
    "performance: cache completed month badges",
    { hourUTC: 3, minuteUTC: 5 },
    internal.performance.queries.cacheCompletedMonthBadges,
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

  // Links Academy logins whose intranet account showed up later.
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

  // Zeiterfassung. Convex schedules in UTC, so these run hourly and work out
  // from the Europe/Berlin clock whether anything is due — right in CET and
  // CEST alike, and idempotent. Minute 0 is 18:00 Berlin in both seasons.
  crons.hourly(
    "time: close entries still open at 18:00 Berlin",
    { minuteUTC: 0 },
    internal.time.jobs.autoCloseOpenEntries,
    {},
  );
  // Fixed hours (timeProfiles.autoBook): book days once they are over.
  crons.hourly(
    "time: book fixed hours",
    { minuteUTC: 15 },
    internal.time.autoBook.bookFixedHours,
    {},
  );
  // 15th 00:05 Berlin: lock last month; 1 Dec: seed next year's holidays.
  crons.hourly(
    "time: lock months and seed holidays",
    { minuteUTC: 5 },
    internal.time.jobs.lockAndSeed,
    {},
  );
  // January: open the new vacation year; from 1 April 00:10: expire carry-over.
  crons.hourly(
    "time: vacation carry-over and expiry",
    { minuteUTC: 10 },
    internal.time.jobs.vacationYear,
    {},
  );
  // IONOS has no push; two minutes keeps "new mail" timely without hammering it.
  crons.interval(
    "mail: check IONOS inboxes for new mail",
    { minutes: 2 },
    internal.mail.poll.run,
    {},
  );
}

export default crons;
