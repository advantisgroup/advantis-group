# AGENTS.md

Instructions for AI coding agents (Claude Code, etc.) working in this repo.
`CLAUDE.md` points here — this file is the canonical source; keep it up to
date rather than duplicating its content elsewhere.

## Repo shape

Bun workspaces + Turborepo monorepo.

- `apps/intranet` — Next.js internal tool (Clerk auth). Includes
  `/admin/activity` ("ActivityTrack"), guidebooks, absences, admin tools.
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

Always type-check and lint/format touched packages before calling a change
done.

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

## ActivityTrack (`/admin/activity`)

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

## Third-party product mentions (Genesys, Clockodo)

Genesys and Clockodo are third-party trademarks referenced throughout the
ActivityTrack UI (labels, tooltips, FAQ copy, settings). When adding or
touching UI that names either product, check with the user before sourcing
or embedding official logo assets — trademark usage has its own legal
constraints beyond a copyright line, and no logo files exist in this repo
today (`apps/intranet/public/` only has Advantis's own logos).

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
