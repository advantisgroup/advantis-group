# ActivityTrack

Ideas for the fused-state ActivityTrack system (`/activity`). Per the
existing guidance in `AGENTS.md`, these should stay in the "present-tense
coordination" lane and avoid turning ActivityTrack into a performance score
or ranking.

- **Team focus-time report** — aggregate ACTIVE vs IDLE time across a
  department for a given period.
- **Anomaly alerts** — flag unusual state transitions (e.g. ABSENT → ACTIVE
  at odd hours) and surface them to managers via `notifications`.
- **Personal daily summary email** — an opt-in end-of-day email ("today you
  were active 6h20m") sent via Resend.
- **Manager availability/integration-health digest** — a scheduled cron
  (`crons.ts`) that emails managers a *current-state* summary (who's
  reachable right now, and whether any of the three fused signals are
  degraded for their team), following the `updatesEmail.ts` pattern. Not a
  historical activity rollup — `docs/intranet-management-feature-ideas.md`
  explicitly rules out turning ActivityTrack into workforce surveillance, so
  this has to stay present-tense, the same boundary the rest of this file
  already respects.
- **Raw signal timeline for self-service debugging** — let a user see the
  three fused signals (workstation, Genesys, Clockodo) side by side to
  understand why their status looks wrong, extending `/activity/help`.
