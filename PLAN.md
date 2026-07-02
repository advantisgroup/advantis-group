# PLAN — ActivityTrack dashboard overhaul + Clockodo state fix

Branch: `claude/activity-track-dashboard-ui-fj2she`
Status: **partially complete** — backend fixes and the overview/timeline redesign
are implemented and typechecked; sub-page polish and visual verification remain.

## Original request (summary)

1. **UI/UX overhaul** of `/admin/activity` (apps/intranet) so it fits the rest of
   the intranet and reads like a dashboard. Managers must see *at a glance*: was an
   employee active, since when are they inactive — in words/colour, not numbers.
   Numbers stay available for later validation/export (evaluation talks with
   employees).
2. **Clockodo integration bug**: clocking out fires `entry.updated`; refetching
   that entry flipped the person back to ACTIVE. Explore the API and fix.

## What is DONE (by commit)

### 1. `fix(activity/clockodo): stop treating the 'clocked' flag as 'currently running'`

Root cause (verified against Clockodo API v2 semantics + the observed behaviour):

- Entry field `clocked` = "recorded with the stopwatch"; it **stays true after
  clock-out**. It never meant "running right now".
- The only reliable running marker is **`time_until == null`** on an entry.
- `GET /api/v2/entries?time_since=…&time_until=now&filter[users_id]=…` includes
  the running entry when the range covers now.

Changes in `packages/convex/convex/activity/clockodo.ts`:
- `fetchClockodoWork`: running = `entries.some(e => e.time_until == null)`.
- `refreshClockodoByEntry`: fetches the entry only to resolve the user, then
  recomputes the **whole day** via `fetchClockodoWork` (same path as the poller).
  Removed the `entry.stopped` special case. New optional `usersId` arg (from the
  webhook payload) so `entry.deleted` — where the entry 404s — still resolves the
  user and clears the state.
- `apps/api/src/routes/activity.ts`: `/integrations/clockodo/webhook` now passes
  `payload.entry.users_id` through as `usersId`.

### 2. `feat(activity): track when the fused state last changed + batched day history`

- `packages/convex/convex/schema.ts`: `employeeStates.finalStateSince` (optional).
- `packages/convex/convex/activity/state.ts`: `pushSignal` sets it on actual
  state change; `state.overview` returns it; new **`state.historyBatch`** query
  (employeeIds[] + since → today's stateSamples per employee, one subscription).
- `packages/convex/convex/activity/stats.ts`: `teamOverview` returns
  `finalStateSince`.

### 3. `feat(intranet/activity): theme-aware, CVD-validated state palette`

- `apps/intranet/src/app/globals.css`: `--state-active/-incall/-wrapup/-idle/
  -break/-absent` defined for dark **and** light. The 4 chromatic states pass
  the dataviz skill's all-pairs CVD validator against each mode's card surface
  (dark `#22201d`, light `#fefdfb`). BREAK/ABSENT are deliberately recessive
  greys (status-muted; relief = legend + hover labels).
- `apps/intranet/src/components/activity/charts/theme.ts`: `STATE_COLOR` now
  references those variables (was fixed lime/cyan hexes that ignored theming).

### 4. `[UNFINISHED] feat(intranet/activity): dashboard overhaul — overview + timeline`

- **Overview** (`apps/intranet/src/app/(app)/admin/activity/page.tsx`), rewritten:
  - `PageHeader` (icon + title + description) like the rest of the intranet.
  - Fleet tiles (`StatCard`) with share progress bars.
  - Triage model: `bucketOf(row)` → attention | working | away | offline; cards
    sort attention-first; filter chips (All/Inactive/Working/Break-absent/Offline)
    with live counts; shared `StateStripLegend`.
  - Cards lead with the written verdict (`StatusSummary`) + **since-when** line,
    then a compact 24h `StateStrip` of the person's day (data from
    `state.historyBatch`, computed with `dayStateSegments`); numbers demoted to a
    small footer (active today · last seen).
- **Timeline** (`…/admin/activity/timeline/[deviceId]/page.tsx`), rewritten:
  - `PageHeader`; "Right now" card = verdict + since-when + source signals on the
    left; day strip + legend, a newest-first **State changes** feed (words +
    coloured dots + HH:MM), and the day totals shrunk to a one-line validation
    figure on the right. Tabs (Overview/Day/Raw/Export) unchanged.
- `StatusSummary` gains `since` prop → "since {time} · {duration}" sub-line
  (suppressed while an "idle for X" line already answers it; offline rows pass
  `lastSeen` as the since).
- `StateStrip` gains `compact` (h-2, rounded-full, no hour ticks).
- New locale keys in `apps/intranet/src/lib/activity/locales/{en,de}.ts`:
  `overview.sub`, `overview.filter.*`, `overview.noMatches`, `state.sinceFor`,
  `timeline.now.recent`, `timeline.now.recentEmpty`, `timeline.now.numbers`,
  `timeline.now.numbersHint`.

Verified so far: `tsc --noEmit` passes in `packages/convex`, `apps/api`,
`apps/intranet`; eslint clean on all touched intranet files.

## What REMAINS (do these next)

1. **PageHeader consistency on the remaining activity sub-pages** (all currently
   have bespoke `<h1>/<h2>` headers or none). Use the same icons as
   `ActivitySidebar` (`apps/intranet/src/components/layout/ActivitySidebar.tsx`):
   - `devices/page.tsx` — no header at all today; add PageHeader (icon `Monitor`,
     title `t("devices.heading")`); needs a new `devices.sub` en/de key.
   - `people/page.tsx` — same (icon `Users`, `people.heading`, new `people.sub`).
   - `reports/page.tsx` — replace the `<h1>` block (icon `FileBarChart`,
     `reports.title` + `reports.subtitle` exist).
   - `settings/page.tsx` — replace the `<h2>` block (icon `Settings`,
     `settings.heading` + `settings.subtitle` exist).
   - `help/page.tsx` — replace the `<h2>` block (icon `HelpCircle`,
     `help.title` + `help.subtitle` exist).
2. **Visual verification** (`bun run dev:intranet`, port 3001): overview cards in
   both themes (chips, strips, since-lines, empty/unlinked devices), timeline
   right-now card (recent-changes feed, totals line wording in de), reduced
   motion, mobile widths. There is no seeded data in this environment — check
   loading/empty states at minimum, or verify on a dev deployment with real
   agents.
3. **Consider** (nice-to-have, discuss first):
   - Group the overview grid under bucket section headings instead of one grid.
   - `overview.todayActive` share bar per card if managers ask for it.
   - Migrate the activity area's flat `useI18n` dictionaries into next-intl
     namespaces (large mechanical change; the bridge in
     `src/lib/activity/i18n.tsx` documents why it exists).
4. **Deploy note**: the Convex schema change (`finalStateSince`) is additive/
   optional — no migration needed. Existing rows show no since-line until their
   state next changes (nulls are handled).

## Verification commands

```sh
bun install
cd packages/convex && bunx tsc --noEmit
cd apps/api && bun run type-check
cd apps/intranet && bun run type-check && bunx eslint ./src
bun run build:intranet   # full Next build if needed
```

Palette re-validation (if you touch `--state-*`): run the dataviz skill's
`validate_palette.js` with `--pairs all` against surfaces `#22201d` (dark) /
`#fefdfb` (light); current passing sets are in `globals.css`.

## Context a follow-up agent will want

- The activity area was ported from a standalone "ActivityTrack" app; its design
  tokens (`--color-fg`, `panel`, `signal`, `ok`, `warn`, `.kicker`, …) are mapped
  onto intranet variables in `globals.css` — use those, and `PageHeader` +
  standard shadcn components, to "fit the rest of the intranet".
- Fused state engine: `packages/convex/convex/activity/lib/state.ts`
  (`computeEmployeeState`, priority ABSENT→BREAK→IN_CALL→WRAP_UP→ACTIVE→IDLE);
  written verdicts: `apps/intranet/src/lib/activity/status.ts` (`describeStatus`).
- Clockodo semantics recap: `clocked` = stopwatch-recorded (sticky);
  `time_until == null` = running; webhook payloads carry the full entity but we
  only trust id/users_id and refetch; absence webhooks are a separate route
  (`apps/api/src/routes/webhooks/clockodo.ts`) and were not part of the bug.
