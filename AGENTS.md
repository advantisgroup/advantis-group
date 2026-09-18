# AGENTS.md

ALWAYS PULL LATEST CHANGES FROM ORIGIN BEFORE STARTING WORK. COMPARE THE LATEST CHANGES AND SEE IF THEY BREAK YOUR CURRENT CHANGES/SESSION EDITS!

Instructions for AI coding agents (Claude Code, etc.) working in this repo.
`CLAUDE.md` points here — this file is the canonical source; keep it up to
date rather than duplicating its content elsewhere.

## Repo shape

Bun workspaces + Turborepo monorepo.

- `apps/intranet` — Next.js internal tool (Clerk auth). Includes
  `/activity` ("ActivityTrack"), guidebooks, absences, admin tools.
- `apps/marketing` — Next.js public marketing site.
- `apps/api` — Elysia server-to-server API (agent enrollment, integration
  webhooks/relays). Holds `ACTIVITYTRACK_SIGNAL_SECRET` and is the only thing
  allowed to write signals into Convex on behalf of external systems.
- `packages/convex` — shared Convex backend (schema + functions) consumed by
  both Next.js apps and the API service.
- `packages/config`, `packages/types` — shared config/types.

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
done.

## Tests

`packages/convex` is currently the only package with tests. They run on
[`convex-test`](https://docs.convex.dev/testing/convex-test) under Vitest:
the real Convex functions execute against an in-memory backend, so a test
seeds rows, calls `api.*` exactly the way apps/api or the browser would, and
asserts on what landed in the database.

- `convex/auth.test.ts` covers the step-up engine — which level each
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
- Test files live in `convex/` next to the functions so `import.meta.glob` can
  build the module map convex-test needs. Anything named `*.test.ts` is
  excluded from both that map and the Convex deploy bundle.

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

## Convex backend conventions

Read [`docs/convex-best-practices.md`](./docs/convex-best-practices.md)
before adding or editing anything in `packages/convex/convex`. It's Convex's
official best-practices list annotated with where this repo follows it, where
it deliberately doesn't, and why. Nothing enforces any of it automatically —
`packages/convex` runs plain `oxlint`, but none of the `@convex-dev/*` ESLint
rules are installed — so it's on whoever writes the function.

The four that bite hardest here:

- **`.collect()` only on org-scale tables.** `users`/`presence`/`departments`
  are fine; `activitySamples`, `stateSamples`, `messages`, the audit tables
  and `notifications` grow without bound and need `.take()` on an index
  (newest-first) or `.paginate()`.
- **Access control first, via `lib/auth.ts`.** `requireUser` /
  `requireManager` / `requireAdmin` / `requireCapability`, plus non-throwing
  `hasCapability` when the decision is "how much of this record do I reveal."
  Don't hand-roll a `ctx.auth` check.
- **The public `api*` functions are deliberate.** `activity/state.ts`'s
  `pushSignal`/`reportHealth`/`mappings` and every `api*`-prefixed function
  elsewhere are reached from `apps/api` server-to-server behind a server key
  and validate it in-handler. Converting them to `internal` breaks the
  integration relays.
- **No `Date.now()` inside a query's `.withIndex` range bound.** Comparing it
  against already-read rows (overdue labels) is cheap; making the read range
  itself move continuously is not. Pass a rounded time in as an argument.

## Profile / Subprofile architecture

`users` is the one canonical intranet identity ("Profile"); every
feature-owned identity-linked record (the Clockodo link, ActivityTrack's
`people`, HumanResources' `employeeProfiles`, Chat's `conversationMembers`)
is a "Subprofile." See [`docs/architecture/profiles.md`](./docs/architecture/profiles.md)
for the full vocabulary, the slim "Partial profile" projection
(`packages/convex/convex/lib/profile.ts`), and the enrichment convention a
subprofile-fetching query should follow (always the same shape; a
`linked`/`status` discriminant instead of a bare `null` or a silently
filtered-out row).

## ActivityTrack (`/activity`)

The highest-complexity area of the codebase. A fused "is this person working
right now" state, combined from three independent sources:

1. **Desktop agent** ("workstation") — a Windows tray app, not in this repo.
   Authenticates with a per-device bearer token (`devices` table /
   `activity/deviceAuth.ts`) and POSTs raw idle/active samples to the Convex
   HTTP action `POST /ingest` (`convex/http.ts` → `convex/activity/ingest.ts`).
   The agent only ever knows its own `deviceId` — it has no concept of
   `employeeId`, so it cannot call the secret-guarded `pushSignal` mutation
   directly. `ingest.ts` resolves `deviceId → devices.personId → people.employeeId`
   itself and feeds the workstation signal into the fused-state cache via
   `applyStateSignal` (`convex/activity/state.ts`). If you touch device
   linking or the ingest path, keep that resolution intact or the
   "Workstation" row on the dashboard silently goes blank again.
2. **Genesys** — telephony routing status/presence, polled + webhook-relayed
   through `apps/api`.
3. **Clockodo** — time tracking, polled + webhook-relayed through `apps/api`.

Both integrations reach Convex through `apps/api`'s Elysia routes, which are
the only holders of `ACTIVITYTRACK_SIGNAL_SECRET` and call the shared
`applyStateSignal` (via the public `pushSignal` mutation) server-to-server.

Fusion priority (highest wins): `ABSENT → CLOCKED_OUT → BREAK → IN_CALL →
WRAP_UP → ACTIVE → IDLE`. Pure logic lives in
`packages/convex/convex/activity/lib/state.ts`; written-verdict copy lives in
`apps/intranet/src/lib/activity/status.ts`.

Business-hours / out-of-hours quarantine logic:
`packages/convex/convex/activity/lib/businessHours.ts` is the single source
of truth for "when does a workday plausibly happen" — don't duplicate that
decision elsewhere.

## Clockodo absences (`/absences`, `/calendar`, directory "out today")

Distinct from ActivityTrack's Clockodo *entry* polling above — this is the
vacation/sick/personal absence data shown on the absences page, calendar, and
directory "out today" badges. There is **no Convex mirror**: absences change
rarely and don't need to be reactive, so every read fetches Clockodo fresh
through `apps/api` instead of syncing a stored copy via webhook + cron (the
old approach — `clockodoSync.ts`/`absenceSync.ts`/the `/webhooks/clockodo`
route — has been removed).

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
- `apps/api/src/routes/internal/clockodo.ts` — server-key-gated, called by
  Convex's ActivityTrack poller (`activity/clockodo.ts`'s `fetchAbsences`) so
  the raw Clockodo fetch isn't duplicated in Convex's Node runtime too.
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

## Third-party product mentions (Genesys, Clockodo)

Genesys and Clockodo are third-party trademarks referenced throughout the
ActivityTrack UI (labels, tooltips, FAQ copy, settings). When adding or
touching UI that names either product, check with the user before sourcing
or embedding official logo assets — trademark usage has its own legal
constraints beyond a copyright line, and no logo files exist in this repo
today (`apps/intranet/public/` only has Advantis's own logos).

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
  constraints (see existing files in `packages/convex/convex/activity/` for
  the norm: dense "why" comments on tricky invariants, nothing else).
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
  app. See `apps/intranet/src/components/applicants/RouteTabs.tsx` for the
  canonical pattern.
- Don't add speculative abstractions, fallbacks, or error handling for cases
  that can't occur. Match the existing minimal, direct style.
- i18n strings live in `apps/intranet/src/lib/activity/locales/{en,de}.ts`
  (ActivityTrack) and `apps/intranet/src/i18n/messages/{en,de}/` (rest of the
  intranet) — always update both languages together. The second set is split
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
  (`@/components/ui/tooltip`'s `Tooltip`/`TooltipTrigger`/`TooltipContent`,
  triggered by a small `Info` icon) rather than inlining it. Only write the
  long form inline when the surface already has dedicated space for it (e.g.
  a settings page section, not a card in a grid).
