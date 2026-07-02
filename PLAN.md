# PLAN — ActivityTrack dashboard overhaul + Clockodo state fix

Branch: `claude/activity-track-dashboard-ui-fj2she`
Status: **complete** — this file is a handoff artifact and can be dropped
before merge.

## Original request (summary)

1. **UI/UX overhaul** of `/admin/activity` (apps/intranet) so it fits the rest of
   the intranet and reads like a dashboard. Managers must see _at a glance_: was an
   employee active, since when are they inactive — in words/colour, not numbers.
   Numbers stay available for later validation/export (evaluation talks with
   employees).
2. **Clockodo integration bug**: clocking out fires `entry.updated`; refetching
   that entry flipped the person back to ACTIVE. Explore the API and fix.

## What landed (by commit)

1. `fix(activity/clockodo)` — `clocked` is sticky ("recorded with stopwatch"),
   never "running now"; running = `time_until == null`. Webhook refreshes now
   recompute the whole day via the same path as the poller, and `entry.deleted`
   resolves the user from the webhook payload's `users_id`.
2. `feat(activity)` — `employeeStates.finalStateSince` (set on real state
   change; additive/optional schema change, no migration needed) + batched
   `state.historyBatch` query for per-card day strips.
3. `feat(intranet/activity)` — theme-aware, CVD-validated `--state-*` palette
   for dark and light (validated against `#22201d` / `#fefdfb`).
4. Overview + timeline redesign: triage buckets (attention/working/away/
   offline), written verdict + since-when leads every card, day-as-colour
   `StateStrip`, numbers demoted to validation footers.
5. Consistent `PageHeader` (icon + title + description, same icons as
   `ActivitySidebar`) on devices/people/reports/settings/help.
6. QoL batch (all 16 user-approved):
   - Overview: card search, bucket section headings, `?filter=` in the URL,
     30 s tick for relative times, tab-title attention count, Live chip.
   - Timeline: prev/next person switcher, expandable state-change feed,
     ←/→ keyboard day navigation, active-share mini bar, unlinked→People CTA.
   - Devices: sortable columns, skeleton loading, empty→Help CTA.
   - Reports: CSV export of the filtered table.
   - Sidebar: pending-devices badge. "/" focuses search on all search pages.
7. Assumed clocked-out state: a not-clocked-in gap ≤ 1h reads as BREAK; past
   1h it becomes `CLOCKED_OUT` — presented as an _assumption_ (dotted
   "corrects itself" marker + FAQ entry). The transition is backdated onto the
   BREAK sample (since-line shows the real clock-out time); a same-day clock-in
   rewrites the `CLOCKED_OUT` history back to BREAK (`reclassifyClockedOutAsBreak`
   in `state.ts`). From 20:00 (Europe/Berlin; `CLOCKODO_DAY_END_HOUR` /
   `CLOCKODO_TIMEZONE` env overrides) the clock-out is certain: the marker
   disappears, and a later clock-in starts a new stint instead of re-labelling
   the evening. Schema adds `clockodoClockedOut`, `clockodoClockedOutCertain`
   and the new union member (additive, no migration).
8. `fix(activity/crons)` — the integration poller only ran 5-18 UTC on
   weekdays, on the explicit assumption that the Clockodo webhook covered
   everything else. When Clockodo disabled that webhook server-side, state
   froze indefinitely outside that window (observed: "clocked in and working"
   hours after an actual clock-out, with nothing to correct it). Poll is now
   two crons covering the full day/week — `*/2 5-18 * * *` daytime, `*/10
19-23,0-4 * * *` off-hours — so `pollAll` is a real fallback independent of
   webhook health, and the 20:00 certainty transition reliably fires even when
   the webhook is down.

Verified: `tsc --noEmit` (convex/api/intranet), eslint clean, full
`next build` passes. Visual verification against a live backend was skipped
per the requester (no seeded data/credentials in the dev environment).

## Context a follow-up agent will want

- Activity design tokens (`--color-fg`, `panel`, `signal`, `ok`, `warn`,
  `.kicker`, …) are mapped onto intranet variables in `globals.css`; use those
  plus `PageHeader`/shadcn to fit the intranet.
- Fused state engine: `packages/convex/convex/activity/lib/state.ts`
  (priority ABSENT→BREAK→IN_CALL→WRAP_UP→ACTIVE→IDLE); written verdicts:
  `apps/intranet/src/lib/activity/status.ts` (`describeStatus`).
- Clockodo semantics: `clocked` = stopwatch-recorded (sticky);
  `time_until == null` = running; webhooks are trusted only for id/users_id.
- Palette re-validation (if you touch `--state-*`): dataviz skill's
  `validate_palette.js`, `--pairs all`, surfaces `#22201d` / `#fefdfb`.
