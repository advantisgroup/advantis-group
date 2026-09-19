# Convex restructure: feature folders and one set of builders

`packages/convex/convex` grew by accretion: ~107 modules sit flat in the root,
grouped only by name prefix (`academy*`, `error*`, `wiki*`, `guidebook*`,
`performance*`, `salesCockpit*`, `itTicket*`, `draft*`), while a few features
got folders (`activity/`, `integrations/`, `salesCoachEv/`). Helpers live in
five places (`lib/`, `activity/lib/`, `performance/lib/`, `integrations/lib/`,
`salesCoachEv/lib.ts`), and function builders are wrapped several times over:

- 84 files import `sandboxedMutation as mutation` — it reads as Convex's
  `mutation` but isn't.
- `lib/featureGate.ts`'s `gated*` builders wrap those sandboxed builders again.
- 6 action-side access checks round-trip through the *public* `api.users.me`
  (flagged in `docs/convex-best-practices.md`).
- 69 `api*` functions each hand-roll `serverKey: v.string()` +
  `assertServerKey` + `getUserByClerkId`.

Target, agreed 2026-09-18: **feature folders with a per-feature `lib/`**
(the layout `docs/convex-best-practices.md` already prescribes) and **one
`convex/functions.ts`** that every module imports its builders from.

## Target layout

```
convex/
  functions.ts        query, mutation, action, internal*, server*, gated* builders
  schema.ts, tables/  (done)
  http.ts, crons.ts, auth.config.ts
  lib/                cross-feature helpers only: auth, stepUp, validators,
                      notify, audit, text, internalApi, profile, users …
  <feature>/          function modules → api.<feature>.<module>.<fn>
    lib/              that feature's private helpers (no Convex functions)
```

Rules:

- A feature gets a folder once it has two or more modules. A single-module
  feature stays a root file (`chat.ts`, `files.ts`, `aiRuns.ts`,
  `announcements.ts`, `events.ts`, `designFeedback.ts`).
- Module names drop the folder prefix: `academyParticipants.ts` →
  `academy/participants.ts` (`api.academy.participants.list`).
- `lib/` folders never export Convex functions; function modules never hold
  logic other modules import. If two features need a helper, it moves up to
  root `lib/`.

| Folder | Modules (old name → new) |
| --- | --- |
| `academy/` | academyParticipants → participants, academyQuestions → questions, academyResults → results, academySettings → settings |
| `activity/` | unchanged; `activity/lib/users.ts` inlined |
| `blog/` | blogPosts → posts, blogAnalytics → analytics, sharing → sharing |
| `drafts/` | drafts → drafts, draftShares → shares; `lib/drafts.ts` → `drafts/lib/` |
| `fehlermanagement/` | errorReports → reports, errorMeasures → measures, errorCategories → categories, errorSettings → settings (named after the `/fehlermanagement` route) |
| `guidebooks/` | guidebookPages → pages, guidebookAttachments → attachments, guidebookFeedback → feedback, guidebookHighlights → highlights, guidebookReads → reads |
| `hr/` | applicants → applicants, applicantVault → vault, humanResources → employees |
| `integrations/` | onedrive → onedrive, clockodoWebhookLog → clockodoWebhookLog, analytics (PostHog capture) → posthog; existing `integrations/*` stays; `integrations/lib/auth.ts` → root `lib/` |
| `itTickets/` | itTickets → tickets, itTicketThreads → threads |
| `marketing/` | emails → emails, whitepaperLeads → leads, marketingAnalytics → analytics |
| `notifications/` | notifications → notifications, outbound → email |
| `org/` | orgData → structure, orgDataMigration → structureMigration, customRoles → roles, approvalDelegations → delegations, offboarding → offboarding, adminOverview → overview, auditLog → auditLog, featureFlags → featureFlags |
| `people/` | users → users, members → members, clerkSync → clerkSync, invites → invites, accessRequests → accessRequests, presence → presence, userPreferences → preferences, tourProgress → tourProgress, sandbox → sandbox |
| `performance/` | performanceAuth → auth, performanceQueries → queries, performanceImport → import, performanceUploadParse → uploadParse, performanceExport → export, performanceTopics → topics, companies → companies, companyRoles → roles; `lib/performanceAuth.ts` → `performance/lib/auth.ts` |
| `salesCockpit/` | salesCockpit → projects + lexikon (split by what it holds), salesCockpitFlows → flows |
| `salesCoachEv/` | unchanged; `lib.ts` → `lib/auth.ts` |
| `security/` | stepUp, passkeys, totp, secondaryEmails, passwordResets, accountLinks (same names); `lib/passwordResets.ts` → `security/lib/` |
| `suggestions/` | suggestions → suggestions, suggestionCategories → categories |
| `updates/` | updates → updates, updatesEmail → email, updatesInternal → internal |
| `wiki/` | wikiEntries → entries, wikiCategories → categories, wikiChats → chats, wikiFormatSettings → formatSettings, wikiMigration → migration |

## Deploying a move safely

Moving a module renames every function in it, and three things hold the old
name:

1. **Browser tabs on the previous bundle.** Vercel and the Convex deploy land
   minutes apart, and open tabs keep the old bundle until reload.
2. **Already-scheduled jobs.** `ctx.scheduler.runAfter/runAt` stores the
   function path. Today's targets: `updates.publishScheduled` (can be days
   out), `notifications.resurface`, `outbound.sendNotificationEmail`,
   `updatesEmail.sendBulk`, `passwordResets.autoIssueLinkedReset`,
   `announcements.notifyPublished`, `analytics.capture`,
   `activity.migrationRun.run`.
3. **apps/api**, which deploys separately from Convex.

So each move leaves a **shim** at the old path — the old file becomes
`export { a, b } from "./<feature>/<module>";` for the public and scheduled
functions only — and a later cleanup commit deletes the shims once a release
has been live for a week and no job targets the old path.

## Phases

Each phase is its own commit (`AGENTS.md`, "Multi-item sessions"), and each
feature move is its own commit so a broken deploy bisects to one feature.

0. **Builders** — no `api.*` change. Add `functions.ts`; switch every module
   to it; turn the `gated*` builders into `functions.ts` exports; add
   `serverQuery`/`serverMutation`/`serverAction` for the `api*` functions;
   replace the `api.users.me` round-trips with one internal access query.
1. **Helpers** — no `api.*` change. Collapse `integrations/lib/`,
   `salesCoachEv/lib.ts`, `activity/lib/users.ts` and the feature-specific
   files in root `lib/` into the per-feature `lib/` folders above.
2. **Feature moves**, smallest blast radius first: academy, suggestions,
   fehlermanagement, guidebooks, wiki, blog, marketing, itTickets,
   salesCockpit, drafts, updates, notifications, hr, integrations,
   performance, security, org, people (last — `api.users.*` has the most
   callers). Update intranet, apps/api and tests in the same commit; run
   `convex codegen` so `_generated/api.d.ts` matches.
3. **Shim removal**, one commit, after the last move has been live a week.

`docs/architecture/overview.md` and `AGENTS.md` paths get updated in the
phase that moves them.

## Progress

- **2026-09-18 — phases 0–2 done.** `functions.ts` builders; `server*`
  builders for the 94 server-key functions; `users.callerForAction` replaces
  the `api.users.me` round-trips; `appError` moved to `lib/errors.ts`;
  shared `test.setup.ts`; every feature in the table above moved, one commit
  each, with shims at the 74 old paths.
- **2026-09-18 — phase 2b done.** Every helper one function module imported
  from another now lives in its feature's `lib/` (19 new `lib` files, e.g.
  `activity/lib/signals.ts` for `applyStateSignal`, `activity/lib/settings.ts`,
  `updates/lib/updates.ts`, `performance/lib/reports.ts`). No function module
  imports from another function module any more.
- **Shim removal (phase 3): not before 2026-09-25**, and only once no
  scheduled job targets an old path (check the dashboard's scheduled
  functions for `updates:publishScheduled` first — it can sit for days).
  `notifications:resurface` (snoozed notifications) can sit for weeks too;
  if either still has queued runs, keep just that one re-export and delete
  the rest. As of 2026-09-19 no code in the apps, apps/api, Convex or
  scripts calls any of the old paths.
