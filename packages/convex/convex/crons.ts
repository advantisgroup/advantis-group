import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

/**
 * Scheduled jobs. ActivityTrack polls Genesys + Clockodo and folds the results
 * into the fused employee state, plus daily retention pruning. Convex crons run
 * on the free tier and can fire frequently. Adjust the schedule to your team's
 * hours / timezone.
 */
const crons = cronJobs();

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
crons.hourly("chat: purge expired left DMs", { minuteUTC: 20 }, internal.chat.purgeExpiredDms, {});

export default crons;
