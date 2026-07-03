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

## House style

- No comments explaining _what_ code does — only _why_, for non-obvious
  constraints (see existing files in `packages/convex/convex/activity/` for
  the norm: dense "why" comments on tricky invariants, nothing else).
- Don't add speculative abstractions, fallbacks, or error handling for cases
  that can't occur. Match the existing minimal, direct style.
- i18n strings live in `apps/intranet/src/lib/activity/locales/{en,de}.ts`
  (ActivityTrack) and `apps/intranet/src/i18n/messages/{en,de}.json` (rest of
  the intranet) — always update both languages together.
