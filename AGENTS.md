# AGENTS.md

ALWAYS PULL LATEST CHANGES FROM ORIGIN BEFORE STARTING WORK. COMPARE THE LATEST CHANGES AND SEE IF THEY BREAK YOUR CURRENT CHANGES/SESSION EDITS!

Instructions for AI coding agents (Claude Code, etc.) working in this repo.
`CLAUDE.md` points here — this file is the canonical source; keep it up to
date rather than duplicating its content elsewhere.

## Repo shape

Bun workspaces + Turborepo monorepo.

- `apps/intranet` — Next.js internal tool (Clerk auth). Includes guidebooks,
  absences, admin tools.
- `apps/marketing` — Next.js public marketing site.
- `apps/api` — Elysia API: Clerk-authed endpoints the intranet calls (AI,
  Clockodo, OneDrive, …) plus server-to-server integration webhooks.
- `packages/convex` — shared Convex backend (schema + functions) consumed by
  both Next.js apps and the API service.
- `packages/config`, `packages/types` — shared config/types.

[`docs/architecture/overview.md`](./docs/architecture/overview.md) has the
hand-checked diagram of who calls whom — keep it in sync when you add an
integration or change which side owns a call.

Package manager is `bun` (see `packageManager` in root `package.json`); use
`bun install`, not npm/pnpm/yarn.

## Commands

Run from repo root unless noted; Turborepo filters by workspace name.

- `bun install` — install all workspace deps.
- `bun run dev` / `bun run dev:intranet` / `bun run dev:marketing` / `bun run dev:api`
- `bun run build`, `bun run lint`, `bun run type-check`, `bun run format`
  (each has a `:intranet` / `:marketing` / `:api` filtered variant)
- Convex package specifically: `cd packages/convex && npx tsc --noEmit` for a
  fast type-check; `npx convex dev` / `npx convex deploy` for the backend.
- `bun run test` — the whole suite; `bun run test:convex` for just the Convex
  package. See "Tests" below.

Always type-check and lint/format touched packages before calling a change
done. Formatting is oxfmt, configured once in the root `.oxfmtrc.json`; CI's
first step is `bun run format:check`, so run `bun run format` before every
commit — it's what has failed CI most often.

## Tests

`apps/api` has route tests on `bun test` (`apps/api/src/app.test.ts`) that
need no network: health, server-key refusal, `signedIn` refusal and the
Convex-error → HTTP status mapping.

`packages/convex`'s tests run on
[`convex-test`](https://docs.convex.dev/testing/convex-test) under Vitest:
the real Convex functions execute against an in-memory backend, so a test
seeds rows, calls `api.*` exactly the way apps/api or the browser would, and
asserts on what landed in the database.

- `convex/security/auth.test.ts` covers the step-up engine — which level each
  verification method banks, and which (policy, credential, risk) combination
  opens the sign-in gate or the destructive-action gate.
- Config lives in `packages/convex/vitest.config.ts`. It needs the
  `edge-runtime` environment (Convex handlers get `crypto.subtle`, which plain
  Node's test environment doesn't provide the same way) and sets
  `CONVEX_SERVER_KEY`, which every `api*` function checks.
- **`convex-test` must stay version-matched to `convex`.** Its peer range is
  narrow and a mismatch fails at the syscall layer with an unhelpful
  `Right-hand side of 'instanceof' is not an object`, not a version warning.
  If you bump `convex`, bump `convex-test` with it.
- Test files live next to the functions they test and import the module map
  from `convex/test.setup.ts`. Convex skips any file with more than one dot
  in its name, so `*.test.ts` and `test.setup.ts` never reach the deploy
  bundle (or that map).

## Previewing the marketing site locally (Clerk bypass)

`apps/marketing/src/proxy.ts` wraps the next-intl middleware in
`clerkMiddleware`, so every request does a Clerk handshake before a page
renders. Without real Clerk credentials that handshake 400s and *every* route
serves Clerk's JSON error (`"Invalid host"` / `host_invalid`) instead of the
site — so a sandbox with no keys can't render a single page, let alone
screenshot one.

For **visual and layout work only**, stub the middleware locally: keep a copy
of `src/proxy.ts`, then drop the `clerkMiddleware` import and export the
plain next-intl middleware directly, keeping the same early return for
`/api`, `/trpc`, `/ingest` and `/content` and the same `config.matcher`. Pair
it with a gitignored `apps/marketing/.env.local` holding throwaway values for
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
`NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_EMAIL_ADRESS` — the publishable key
has to be `pk_test_` + base64 of a host ending in `$` or Clerk's client
rejects it before the page mounts.

**`src/proxy.ts` is tracked.** Committing the stub ships a marketing site with
no auth middleware, so restore the original before staging anything and check
it does not appear in `git status`. A running dev server hot-reloads that
restore and immediately goes back to 400ing every route, so expect to
re-apply the stub if you still need to preview, and to restore it again
before the next commit.

**Do not use it for anything auth-shaped.** Sign-in/up, `/account`, the
account menu, and the contact form's "use my account details" prefill all
depend on a real Clerk session; under the bypass they are either dead or
misleading, and a green result means nothing. Those need real keys.

Known local-only symptoms under the bypass, none of which are bugs to chase:
`/blog` returns 500 because `getPosts` queries the fake Convex URL; pageview
tracking silently records nothing for the same reason (see
`AnalyticsTracker.tsx`); ClerkJS logs a development-mode init error in the
console.

Headless Chromium in the Claude Code web sandbox cannot reach `localhost`
through the agent HTTPS proxy — it fails with `ERR_CONNECTION_RESET`. Launch
it with `--proxy-server=direct://` to screenshot the dev server. That also
cuts off external hosts, so anything that loads remote images (the GitHub
owner avatars on `/licenses`) will show its fallback rather than the real
asset.

## Asking questions

The user (Kaleb) does not mind being asked clarifying questions, and does not
mind agents surfacing a large number of improvement suggestions at once (30+
is fine). Don't self-censor or trim suggestion lists down to a "safe" handful
out of concern for overwhelming him — err toward asking and toward listing
more candidate improvements rather than fewer.

## Multi-item sessions and commits

When a single session is asked to ship several distinct features, improvements,
or fixes together, group them by how they relate (e.g. all touching the same
subsystem, or one plan) but still commit each piece of work separately on the
same branch, rather than squashing everything into one commit. This keeps the
branch bisectable — if something breaks (a Vercel preview build, CI, a runtime
regression), the offending commit narrows down fast instead of forcing a search
through one giant diff. If grouping vs. separating conflicts with another
instruction in a given task (e.g. the user explicitly asks for a single
commit), ask the user how they want it handled rather than guessing.

## Merging without a PR

When the user hasn't asked for a PR, the default is to squash-commit/merge
finished work directly into `main` rather than opening one anyway. But
pushing to `main` triggers an immediate Vercel production deploy — so for a
task still spread across multiple commits/phases, keep committing and
pushing to the working branch only, and merge into `main` once at a real
stopping point (the whole task done, or a checkpoint the user explicitly
asks for), not after every intermediate commit.

## Intranet page list (search and the AI wayfinder)

`packages/convex/convex/lib/pages.ts` is the one list of intranet pages —
name, what you do there, keywords, who can see it and its deep links. The
⌘K palette (`api.intranetPages.list`) and the "find your way around" AI
(`lib/aiContext.ts` + `lib/navigateSearch.ts`) both read it. When you add a
page under `apps/intranet/src/app/(app)`, add a line there (or to
`NOT_DESTINATIONS` with a reason): `lib/pages.test.ts` walks the app
directory and fails otherwise.

AI runs keep a sealed transcript of what they sent (`aiRunTranscripts`,
recorded by `runModelText`/`runModelTurn` in `apps/api/src/lib/ai.ts`). Call
the model through those, never `anthropic.streamText` directly, or the run
won't show up correctly in Settings → AI → history.

`use_ai` switches AI on for a person but never opens an area to them:
`aiRuns.apiStart` also checks the area's own permission per run kind
(`hasAreaAccess`) and the per-employee daily limit (the workspace's, or the
highest one set by a role that grants `use_ai`). A new run kind needs a
case there; an AI call that isn't a run goes through `requireAi` in
`apps/api/src/lib/ai.ts`.

## Convex backend conventions

Read [`docs/convex-best-practices.md`](./docs/convex-best-practices.md)
before adding or editing anything in `packages/convex/convex`. It's Convex's
official best-practices list annotated with where this repo follows it, where
it deliberately doesn't, and why. Nothing enforces any of it automatically —
`packages/convex` runs plain `oxlint`, but none of the `@convex-dev/*` ESLint
rules are installed — so it's on whoever writes the function.

Define every function with the builders from `convex/functions.ts`, never
`_generated/server` (types like `MutationCtx` still come from there):

- `userQuery`/`userMutation`/`userAction` for anything a signed-in person
  calls. They resolve the caller once and hand the handler `ctx.caller`
  (`lib/caller.ts`); declare what's needed up front —
  `userQuery({ role: "manager", … })`, `can: "manage_blog"`,
  `applicant: "access"` (also checks the vault) — and use
  `ctx.caller.owns(id)`, `.can(cap)`, `.isAdmin` inside.
- `serverUserQuery`/`serverUserMutation`/`serverUserAction` for apps/api
  calls on behalf of a person: they take `serverKey` + `clerkUserId` and give
  the same `ctx.caller`. Plain `server*` is for calls with no person behind
  them (webhooks, pollers).
- `mutation`/`action` refuse to run in sandbox mode, `gated*(flag)` stop work
  while a feature flag is off.
- Every builder hides trashed rows (`lib/trash.ts`) from `ctx.db`;
  `ctx.unfilteredDb` sees them. Deleting authored content means
  `moveToTrash`, not `ctx.db.delete` — see `docs/backups.md`.

See `docs/future-features/22_convex-restructure.md` for where modules are
heading.

The ones that bite hardest here:

- **`.collect()` only on org-scale tables.** `users`/`presence`/`departments`
  are fine; `messages`, the audit tables and `notifications` grow without
  bound and need `.take()` on an index (newest-first) or `.paginate()`.
- **Access control through the caller.** Put the requirement on the builder;
  for "how much of this record do I reveal" ask `ctx.caller.can(…)`. Outside a
  handler (internal functions, shared helpers) use `requireSessionCaller` /
  `getSessionCaller` / `requireServerCaller` / `getServerCaller`. Suspended
  and removed people never get a caller. Don't hand-roll a `ctx.auth` check.
- **Users are never deleted.** Removing someone sets `status: "removed"`
  (`markUserRemoved`); 129 fields point at `users`. Lists should skip
  `removed` rows.
- **The public `api*` functions are deliberate.** Every `api*`-prefixed
  function is reached from `apps/api` server-to-server behind a server key
  and validates it in-handler. Converting them to `internal` breaks the
  integration relays.
- **No `Date.now()` inside a query's `.withIndex` range bound.** Comparing it
  against already-read rows (overdue labels) is cheap; making the read range
  itself move continuously is not. Pass a rounded time in as an argument.

## Profile / Subprofile architecture

`users` is the one canonical intranet identity ("Profile"); every
feature-owned identity-linked record (the Clockodo link, HumanResources'
`employeeProfiles`, Chat's `conversationMembers`) is a "Subprofile." See
[`docs/architecture/profiles.md`](./docs/architecture/profiles.md) for the
full vocabulary, the slim "Partial profile" projection
(`packages/convex/convex/lib/profile.ts`), and the enrichment convention a
subprofile-fetching query should follow (always the same shape; a
`linked`/`status` discriminant instead of a bare `null` or a silently
filtered-out row).

## Clockodo absences (`/calendar`, dashboard, directory "out today")

The vacation/sick/personal absence data shown in the calendar, dashboard
widgets and directory "out today" badges. The `/clockodo` tab (time table,
planner, requests, approvals, Clockodo user admin) was removed on 2026-10-09;
only these reads and the header clock pill (`ClockodoHeaderControl`, removed
at the Zeiterfassung go-live) still talk to Clockodo, plus the one-off import
in Zeiterfassung → Verwaltung → Import. There is **no Convex mirror**:
absences change rarely and don't need to be reactive, so every read fetches
Clockodo fresh through `apps/api` instead of syncing a stored copy via
webhook + cron (the old approach — `clockodoSync.ts`/`absenceSync.ts`/the
`/webhooks/clockodo` route — has been removed).

- `apps/api/src/lib/clockodo.ts` — the one place that calls Clockodo's
  `/absences` endpoint and maps its raw type/status codes to the app's coarse
  `vacation | sick | personal | other` / `pending | approved | denied |
  cancelled`.
- `apps/api/src/routes/clockodo-absences.ts` — Clerk-authed public endpoints
  (`GET /clockodo/absences/me`, `/calendar`, `/pending-count`) the intranet
  frontend calls via `useEdenApi()` (`apps/intranet/src/lib/eden.ts`).
  **Privacy**: the calendar endpoint only surfaces `vacation`-type absences
  for people other than the caller — sick/personal/other absences are visible
  to that person alone (their own `/me` list still shows everything).
- `packages/convex/convex/integrations/clockodoAbsences.ts` — server-key
  gated lookups (`resolveCaller`, `roster`) apps/api uses to join a Clockodo
  user id against the intranet roster, since Clockodo doesn't know intranet
  identities.
- `apps/intranet/src/lib/absences-api.ts` — the `useMyAbsences` /
  `useAbsencesCalendar` / `usePendingAbsenceCount` hooks every consumer page
  uses. Not reactive like a Convex `useQuery` — each fetches once per
  mount/param change, which is fine given how rarely absences change.
- The old `absences` Convex table is no longer in `schema.ts`. Any old mirrored
  rows still sit in the deployment's data, but nothing reads them.
- `integrations/clockodoLink.ts`'s `migrateLegacyClockodoLink` moves a link
  that only exists on a leftover ActivityTrack `people` row onto
  `users.clockodoUserId` (from the settings Connections card). It goes away with the `people` table.

## Zeiterfassung (`/zeiterfassung`, own time tracking)

Replaces Clockodo for working time and absences; spec and cutover plan in
[`docs/future-features/04a_zeiterfassung-spec.md`](./docs/future-features/04a_zeiterfassung-spec.md).
Access before go-live is governed by Convex `TIME_MODE` (test → preview →
live); `/zeiterfassung` is in `maintenance.ts`'s `OPEN_PREFIXES`.

- Tables: `packages/convex/convex/tables/time.ts`. Absences are `timeAbsences`
  (a legacy `absences` table may still hold prod rows).
- Rules are pure functions in `convex/time/lib/` (Berlin calendar without
  `Intl`, holidays, targets, ArbZG warnings, vacation carry-over, month lock,
  18:00 auto-close) with unit tests in `calc.test.ts`. The intranet imports
  the same functions from `@advantis/convex/time`, so day totals are computed
  live in the browser with exactly the server's rules — change a rule in one
  place.
- Functions in `convex/time/*.ts`; `time/lib/store.ts` holds the shared
  database helpers. Every write goes through `writeAudit` (`timeAuditLog`);
  nothing is hard-deleted (`status: "deleted"`). Employees only reach their
  own rows (`subjectFor`); admin-only functions declare `role: "admin"`.
  Managers get nothing extra here.
- Month lock: any change touching a locked month throws `reason:
  "month_locked"`, admins included — they unlock with a reason first.
  Exceptions that write history as it was: the Clockodo import and the
  initial backfill when an admin switches on fixed hours (`time/autoBook.ts`,
  `timeProfiles.autoBook`; the hourly job itself skips locked months).
- `timeMonthTotals` caches a locked month's worked/target minutes for the
  hours account. Anything that changes a month's inputs must call
  `invalidateTotals`/`invalidateTotalsFrom`; a missing row is computed live.
- Crons are hourly and decide from the Berlin clock what is due (UTC
  schedules can't express 18:00 Berlin in both CET and CEST).
- `convex/_generated/api.d.ts` lists the new modules by hand (codegen needs a
  deployment) — keep it in sync when adding a file under `convex/time/`.

## IONOS mailbox panel (header mail button)

Each person's own IONOS inbox, read-only, in a right-hand panel opened from
the header (`components/mail/MailPanel.tsx`). Admins-only until the Convex env
var `MAIL_MODE` is `live` (`mail/lib/access.ts`).

- An admin stores address + password centrally (panel → "Postfächer
  verwalten" → `PUT /mail/accounts/:userId`). apps/api checks the login with
  IONOS, encrypts the password with `MAIL_ENC_KEY` and only then hands it to
  `mail.accounts.apiSetAccount`. Convex never sees it in plain text.
- Reads (`/mail/inbox`, `/mail/messages/:uid`, attachments) only ever open the
  **caller's own** mailbox (`apiMyAccount`) — admins included; setting a
  password never lets anyone else read that inbox. Nothing is stored: every
  open is a live IMAP read with EXAMINE/BODY.PEEK, so IONOS read state,
  folders and messages stay untouched.
- Mail HTML renders in a sandboxed `srcdoc` iframe (no scripts, opaque
  origin, CSP blocking remote images until "load images").
- `crons.ts` runs `mail.poll.run` every two minutes → `/internal/mail/poll`
  → `mail.poll.record`, which updates the unread badge and writes
  `mail_received` notifications (deep link `/?postfach=<uid>`, opened over the
  current page via `notificationHref`). A first poll after (re)setting a
  password only records a baseline. A rejected login alerts admins once.
- Every mail route refuses on Vercel Preview (`assertMailAvailable`), and
  `MAIL_ENC_KEY` must only be set for Production.

## Removed: ActivityTrack

ActivityTrack (`/activity`, the desktop agent's `/ingest`, Genesys/Clockodo
state polling) was removed on 2026-10-05. Its tables
(`packages/convex/convex/tables/activity.ts`) stay in the schema only until
their production data is deleted — don't build on them. Retired values
existing documents can still hold stay accepted by the schema but grant or
show nothing: the `view_activity_admin` capability
(`storedCapabilityValidator`), a `featureFlags` row keyed `activitytrack`,
`integrationHealth` sources `genesys`/`clockodo` and `auditLog` domain
`activity`.

## Third-party product mentions (Clockodo)

Clockodo is a third-party trademark referenced in the UI (labels, tooltips,
settings). When adding or touching UI that names it, check with the user
before sourcing or embedding official logo assets — trademark usage has its
own legal constraints beyond a copyright line, and no logo files exist in
this repo today (`apps/intranet/public/` only has Advantis's own logos).

## Password resets (HR vault, Performance login)

The two areas with a password of their own outside Clerk share one recovery
flow: a lock screen offers "forgot password" *only after a failed attempt*, it
files an admin ping (never resets anything), and an admin issues a single-use
magic link at `/password?o=<scope>&token=…`. Queue lives at
`/admin/password-resets`. Both admin actions are gated on Clerk step-up
re-verification, which reads the factor-verification-age claim through a
custom `convex` JWT Template key named `reverificationAge` — Clerk's
dashboard blocks the literal name `fva` on hand-built templates ("reserved
claim"), so the same `{{user.factor_verification_age}}` shortcode is mapped
under that name instead. See
[`docs/password-resets.md`](./docs/password-resets.md) for the exact setup,
the env vars, the audit/PostHog logging, and how to add a third area.

## Publishing Updates (incidents / maintenance / changelog)

The intranet's global banner + `/updates` feed can be published from a
markdown file — useful for an agent shipping a change worth announcing. See
[`docs/publish-guide.md`](./docs/publish-guide.md) for the full how-to
(frontmatter reference, required env, the `bun run updates:publish` script)
and [`docs/writing-good-updates.md`](./docs/writing-good-updates.md) for
what makes a good title/summary/body. `docs/` is where agent- and
human-facing docs for this repo live going forward — add new ones there
rather than growing this file further.

## Convex preview deployments

`scripts/vercel-preview-convex-build.sh` claims a Convex preview deployment
keyed by git branch name on every non-production Vercel build, logging
`[convex-preview] ...` lines (branch, resolved backend URL) so a backend
change on a branch that didn't get a `--preview-create` is visible in the
build log. Convex has no CLI/API command to delete a preview deployment
(open feature request: get-convex/convex-backend#455) and every deployment
— prod, dev, and every preview ever claimed — counts against the team's
total Convex deployment limit. If a branch's backend (and its data) resets
without cause, check the Convex dashboard's deployment count against the
team's plan limit and manually delete preview deployments for merged/closed
PRs there.

`apps/api` is wrapped by a separate `scripts/vercel-preview-convex-api-build.sh`
instead, resolving the _same_ branch-scoped backend and writing it to
`apps/api/src/lib/convexPreviewUrl.generated.ts` (a `getConvex()` fallback)
rather than baking it into a client bundle — it's a plain server, not a
Next.js app, so there's no `NEXT_PUBLIC_*` build-time inlining to piggyback
on, and a Vercel Function's runtime env vars come from the project's stored
Environment Variables, not whatever a build subprocess exported. Without
this, `apps/api`'s Preview deployments talk to a different Convex backend
than `apps/intranet`'s — session tokens issued by one are invalid on the
other, which surfaces as every Performance report upload failing with
`Forbidden` on preview regardless of file content.

`packages/convex/convex/crons.ts` deploys unchanged to every deployment —
prod, `npx convex dev`, and every branch's preview — so scheduled jobs are
gated behind a `DISABLE_CRONS` env var (see the comment at the top of that
file) rather than being allowed to run on all of them. Preview and dev
deployment *types* should have `DISABLE_CRONS=true` as a project default
(`npx convex env default set DISABLE_CRONS true --type preview` / `--type
dev`); production is deliberately left unset so the schedule keeps running
there without needing prod's own env vars touched. Defaults only seed *new*
deployments, so any preview deployment that already exists needs the var set
directly (`npx convex env set DISABLE_CRONS true --preview-name <branch>`) —
otherwise it keeps running the old (cron-enabled) code until its next deploy
picks up this guard, and still needs the var set even then.

## House style

- No comments explaining _what_ code does — only _why_, for non-obvious
  constraints (dense "why" comments on tricky invariants, nothing else).
- **Primary actions never live inline in a view.** Create/add/log flows
  (new applicant, log a contact, schedule an appointment, …) open a dialog
  — a bottom sheet on mobile — or navigate to a dedicated page; they are
  never rendered as an always-visible form card sitting on top of the
  content. Views stay read-focused overviews with explicit action buttons.
  See `apps/intranet/src/components/applicants/EntryDialogs.tsx` for the
  canonical pattern.
- **A page with tabs uses `RouteTabs`, never a bare desktop-only tab bar.**
  Below the mobile breakpoint, `RouteTabs` renders nothing itself and hands
  its tabs to the global `BottomNav` via `useBottomNavTabs`
  (`components/layout/bottom-nav-tabs.tsx`), so the bottom nav becomes the
  tab switcher instead of a second, competing control floating over
  thumb-zone space. A page that rolls its own tab strip and leaves it
  rendered on mobile is inconsistent with every other tabbed page in the
  app. See `apps/intranet/src/components/layout/RouteTabs.tsx` for the
  canonical pattern.
- **A page that offers "Print" gets a paper version, not its screen layout.**
  Mount a `PrintSheet` (`components/print/PrintSheet.tsx` — one in the
  intranet, one in marketing) holding a layout written for A4: it's hidden on
  screen, is the only thing that prints while mounted (Ctrl+P included),
  repeats its head and foot on every sheet, and keeps the browser's own
  URL/date lines off the paper. Printing always switches to the light theme
  for its duration. `HandoffBriefPrint`, `GuidebookPrint` and marketing's
  `InquiryPrint` (in `InquiryDetail.tsx`) are the examples to copy.
- Don't add speculative abstractions, fallbacks, or error handling for cases
  that can't occur. Match the existing minimal, direct style.
- i18n strings live in `apps/intranet/src/i18n/messages/{en,de}/` — always
  update both languages together (`bun run check:i18n` fails otherwise).
  The files are split
  one file per top-level namespace (`messages/en/Admin.json`,
  `messages/de/Admin.json`, etc.), matching the `useTranslations("Admin")`
  call sites 1:1, and `src/i18n/request.ts` statically imports every one of
  those files and merges them into the `messages` object per locale. **When
  adding a brand-new namespace** (not just new keys in an existing one),
  create both `messages/en/<Namespace>.json` and `messages/de/<Namespace>.json`,
  then add both imports and both entries in `messagesByLocale` in
  `request.ts` — this isn't auto-discovered, so a namespace whose files exist
  but aren't wired into `request.ts` silently resolves to missing
  translations. Adding keys to an existing namespace's JSON needs no
  `request.ts` change.
- Prefer short, single-line labels over long inline descriptions, especially
  in compact UI (badges, dropdown items, table cells, permission/capability
  lists) — a wrapping paragraph reflows the layout around it and is worse on
  mobile. When more explanation is genuinely needed, put it behind a tooltip
  (`@/components/ui/info-tip`'s `InfoTip`, a small `Info` icon over
  `@/components/ui/tooltip`) rather than inlining it. Only write the
  long form inline when the surface already has dedicated space for it (e.g.
  a settings page section, not a card in a grid).
