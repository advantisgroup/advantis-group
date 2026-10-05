# Auth consolidation: fewer passwords, intranet account as the hub

The intranet (Clerk) account is already the most-verified identity in the
system — email, passkeys (`passkeys`), TOTP (`totpCredentials`), and the
centralized step-up engine (`lib/stepUp.ts`: `email_code < totp/recovery_code
< passkey`, `stepUpVerifications`/`stepUpAuditLog`). Three other areas each
grew their own password instead of leaning on it:

| Area                         | Credential                    | Linking today                                                                 |
| ----------------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| Performance dashboard         | `performanceLogins.passwordHash` | Optional `linkedUserId` → Clerk session auth via `performance/lib/auth.ts`'s `resolveActiveSession`; password stays live either way |
| HR / Applicant Management     | `applicantVaultPasswords.hash` | None — a second password every member sets themselves, on top of the existing `applicantAccess`/delegate check |
| Academy                       | `academyParticipants.linkedUserId` | Same optional-link shape as Performance, manual only |

`docs/future-features/14_identity-linking.md` already flags the "make linking
automatic, not manual" gap for Performance/Academy. This plan is the
follow-on: once linked, actually retire the second password instead of
running both side by side forever, and give the HR vault the same option.
`docs/password-resets.md`'s admin-mediated magic-link flow (shipped
recently) is the stopgap for the credentials that still exist — this is the
work that shrinks how many of them there are to reset.

Ordered by dependency, smallest first. Each phase should be its own
commit/PR per `AGENTS.md`'s "Multi-item sessions" convention — this is
several distinct changes toward one goal, not one diff.

## Authentication vs. authorization: this plan only touches the former

Everything below consolidates *how someone proves who they are* across
areas. It deliberately does not change *what they're allowed to see once
they've proved it* — that stays owned by each area, as an explicit,
admin-approved grant, exactly as it works today:

- **Performance already has real per-company RBAC**: `companyRoles`
  (`{ companyId, name, permissions: string[] }`) assigned to a login via
  `performanceLogins.roleId`. A login with no `roleId` can authenticate (once
  linked) but has nothing to see.
- **HR/Applicant Management already keys authorization off the intranet
  account directly**: `users.applicantAccess` (can see/edit applicant
  records) and `users.applicantAccessDelegate` (can grant/revoke it for
  others, admin-adjacent allowlist) are both fields on `users`, not on
  `applicantVaultPasswords`. This is the pattern every other area should
  converge toward, not a special case.

The one rule every phase below has to respect: **auto-linking (Phase 1) or
going password-less (Phase 3/4) is identity resolution, never a grant.** A
newly auto-linked Performance login starts with whatever `roleId` it already
had — usually none — same as an unlinked one; a linked intranet account with
no `applicantAccess` still can't open the HR vault. Collapsing "this account
is now recognized as the same person" into "this account can now see the
area's data" would be a real access-control bug wearing a convenience
feature's clothes, so it gets called out explicitly at every phase where the
distinction could blur (Phase 1, Phase 3, Phase 4) rather than assumed obvious.

## Phase 1 — Auto-link at creation, not just after the fact

Closes the gap `14_identity-linking.md` already names.

- `performanceLogins` and `academyParticipants`: on create (and on a nightly
  reconciliation pass, for logins created before their intranet account
  existed), match `email` against `users.by_email` and set `linkedUserId`
  automatically. Keep the existing manual admin link as the fallback for a
  mismatched email (personal vs. work address, a typo, a legal-name change).
- Log the auto-link the same way `security/passwordResets.ts` distinguishes
  `autoApproved`/`autoApprovedVia` from a human decision — an
  `autoLinkedVia: "email_match"` field, so the admin UI can show "linked
  automatically" vs. "linked by an admin" without guessing.
- No behavior change yet for sign-in — this only makes `linkedUserId`
  reliably populated so the later phases have something to build on.
- **Explicitly does not touch `roleId`/`applicantAccess`.** Auto-linking
  resolves identity only; an admin still separately assigns a Performance
  role or grants `applicantAccess`, same as before this phase existed.

## Phase 2 — Secondary/verified emails on the intranet account

The mechanism the rest of this plan leans on: let an intranet account
register additional email addresses (a work-issued Performance address, an
HR-only address) and prove ownership the same way `stepUpChallenges` already
proves the primary one.

- New table, e.g. `userSecondaryEmails`: `{ userId, email, verifiedAt,
  addedAt }`. Verification is a 6-digit code sent to the new address and
  checked back — same shape as `lib/stepUp.ts`'s email-code path and
  `adminVerification.ts`'s admin-code flow, not a new mechanism.
- Only a *verified* secondary email is usable anywhere downstream (as a
  password-reset destination, as a login-matching key). An unverified row is
  a pending add, same convention as `totpCredentials.verifiedAt`.
- Surface it on `/settings/account`, next to the existing passkey/TOTP
  cards (`PasskeySettingsCard.tsx` is the pattern to follow).
- This is additive and inert on its own — nothing reads it yet.

## Phase 3 — Performance: linked accounts stop needing their own password

- Once `performanceLogins.linkedUserId` is set (Phase 1) **and** the login's
  own email is a verified secondary email on that account (Phase 2, or
  matches the primary email outright), treat the password as retired: the
  lock screen redirects straight to "continue with your intranet account"
  instead of offering a password field, the same way `resolveActiveSession`
  already prefers the Clerk session when present.
- Keep `passwordHash` on the row (don't delete it) but stop requiring it for
  new logins created against an already-linked, already-verified person —
  skip issuing a password at creation entirely and mint the row
  password-less, matching how `performanceLogins.ts` already treats
  `password` as optional when `linkedUserId` is set.
- `security/passwordResets.ts`'s `performance` scope then has fewer accounts to ever
  apply to — a linked, password-less login has nothing to reset. Update
  `resolveTarget`'s `performance` branch to say so plainly (surface "sign in
  with your intranet account" instead of a dead-end "no account found") for
  the case where the typed email is a verified secondary email with no
  password to reset.
- An admin can still force a standalone password back onto a linked account
  (contractor sharing a login, edge case where SSO-only is undesirable) —
  this is a default, not a removal of the escape hatch.
- **This changes how the person signs in, not what they can see.**
  `roleId`/`companyId`/permissions stay exactly where they are today, read
  off the (now password-less) `performanceLogins` row the same way they
  always were — going password-less removes a credential, not a permission
  check.

## Phase 4 — HR/Applicant vault: passkey-first, password as fallback only

The vault (`applicantVaultPasswords`) is defense-in-depth on top of an
already-verified `applicantAccess`/delegate grant — it doesn't need its own
independent secret at all, just a second proof of "it's still you at the
keyboard," which a passkey already provides better than a typed password.

- Once a member has at least one registered passkey (`passkeys` table, any
  row), let vault unlock accept a passkey challenge
  (`passkeyChallenges`/`finishAuthentication`, same primitives
  `sign-in/passkey` already uses) as an alternative to typing the vault
  password — not instead of it yet.
- `applicantVaultPasswords` stays as the fallback for members without a
  passkey, and as the recovery path if the passkey is unavailable (lost
  device) — same "backup, not replacement" relationship the user described.
- Once passkey coverage is high enough (track via `passkeys.by_user` count
  vs. active `applicantAccess` count), flip the *default* for newly granted
  vault access to passkey-only with password as an explicit opt-in, rather
  than every new grant starting with a password to set.
- **This changes how the vault is unlocked, not who gets `applicantAccess`
  in the first place.** Granting/revoking `applicantAccess` itself is
  untouched — still an admin or `applicantAccessDelegate` action on the
  `users` row. A passkey only proves "it's still the person who already has
  the grant," same job the vault password does today.

## Phase 5 — Password-reset routing follows the verified email, automatically

`docs/password-resets.md`'s linked-email auto-approval
(`callerLinkedAccount`/`targetLinkedAccount`/`adminLinkedEmail`) is the
precedent this phase generalizes:

- Once Phase 2's `userSecondaryEmails` exists, retire
  `passwordResetLinkedEmails` as the *only* way to register a pairing —
  keep it for cases with no real intranet account to link to, but let a
  verified secondary email satisfy the same "these two addresses are the
  same person" check `resolveTarget` already does, without an admin
  registering it by hand first.
- The existing admin email-choice picker ("which address — feature account
  or intranet account") stays for the genuinely ambiguous case, but a
  Performance login whose only password was retired in Phase 3 has nothing
  left to pick between — the reset flow for it collapses to "sign in with
  your intranet account," same message as Phase 3.

## Phase 6 — Consolidated view, so admins stop tracking this by hand

The user's actual complaint isn't just "too many passwords," it's "admins
have to remember what's linked where." Once Phases 1–5 land:

- Add a "Linked accounts" section to the profile/member admin view (next to
  wherever Clockodo linking is already shown, per
  `docs/architecture/profiles.md`'s subprofile convention) listing every
  area this person has a subprofile in (Performance, Academy, HR vault) and
  whether each is auto-linked, password-less, or still on a standalone
  password — one screen instead of visiting `/admin/performance`,
  `/admin/applicants`, etc. separately.
- This is a read-only rollup, same shape as
  `20_audit-trail-unification.md`'s "first slice: a read-only merged view,
  not a schema migration" — reuse existing per-area queries, don't create a
  new cross-cutting table.

## Phase 7 — Device trust and periodic re-verification for linked areas

Once Phase 3/4 make an area rely on the intranet session instead of its own
password, that trust isn't permanent. This phase reuses the *existing*
step-up engine end to end — same `email_code`/`totp`/`recovery_code`/`passkey`
challenge, same `stepUpVerifications`/`stepUpAuditLog` — by adding a new
trigger condition alongside the ones already there (new device, destructive
action, org policy): a per-area trust window expiring.

- **14-day re-verification ceiling.** Track when an area was last stepped up
  for (a `context`-scoped read of `stepUpVerifications`, or a small
  `lastStepUpAt` per (user, area) if that's cleaner than filtering the
  existing table). Once it's older than 14 days, block entry/fetch to that
  area — Performance, the HR vault, and any future area built this way —
  until a fresh step-up clears it. No silent grace: the area is inaccessible,
  not degraded, until re-verified.
- **Forced first step-up on migration.** The moment an account moves onto
  the new linked, password-less flow (shipped as part of Phase 3/4), force
  one step-up challenge immediately. This is also the natural moment to ask
  the preference below, once, rather than defaulting it silently.
- **Per-area, per-user step-up preference**, asked at that forced first
  step-up and editable later in `/settings`: "always require step-up here"
  (extra security, opt-in) vs. "trust this device for 14 days." Extends
  `securityPreferences` (today just `alwaysRequireMfaAtSignIn`, one row per
  user) with an area-scoped variant — either a second field per area on that
  table, or a small `areaSecurityPreferences: { userId, area, mode }` table
  if one row per (user, area) reads cleaner than overloading the singleton.
- **General device-trust status, not just per-area.** Promote `knownDevices`
  from "have we seen this device hash before" (today, one input into the
  `newDevice` risk signal) into a user-facing, per-device trust record —
  name, last-seen, trusted-until — visible and revocable from `/settings`.
  A device only counts as trusted if the user opted into tracking at all
  (below) and is within its 14-day window; otherwise every session from it
  is untrusted, which forces step-up near-universally — the same way
  `sessionRiskSignals.newDevice` already forces `LEVEL.email_code` today,
  just made the permanent state instead of a one-time signal.
- **Privacy opt-out, modeled honestly, not as a special case.** A user can
  decline device tracking outright. That's not a broken or degraded state —
  it's every session being treated as untrusted, which is already a
  well-defined, already-enforced condition (near-universal step-up). Opting
  out costs convenience, not security, and needs no separate code path: it's
  just "no trusted devices for this user," which the trust check already
  handles.
- **Every toggle this phase adds belongs on `/admin/authentication`.**
  `AuthenticationPolicyPanel.tsx` already holds the org-wide levers
  (`requireMfaScope`, `requirePasskeyScope`, `gracePeriodDays`,
  `exemptUserIds`) — the standing rule going forward is that any new
  security/auth behavior gets a toggle, metric, or rule surfaced there, not
  buried in a per-feature settings corner. Concretely: the 14-day
  re-verification window as an editable org default, a device-trust
  opted-in/opted-out count, and the "always require step-up" vs. "trust
  device" preference split as an admin-visible metric.

## Phase 8 — 30-day legacy password grace period

Once an area ships Phases 1–7, its old standalone password
(`performanceLogins.passwordHash`, `applicantVaultPasswords.hash`) keeps
working for **30 days**, not zero — the same shape as `authPolicy`'s
existing `gracePeriodDays` for the org-wide MFA/passkey rollout, scoped here
to this migration instead:

- The login screen shows a persistent, dismissible notice — "We're moving
  this to your intranet account — sign in with that instead" — linking
  straight to the new flow.
- The old password keeps authenticating for the full 30 days, so nobody is
  force-cut-over mid-migration.
- At day 30 the standalone password stops being accepted; the account
  becomes linked-only, with Phase 3's admin-forced-fallback as the only way
  to reinstate a standalone password for a genuine edge case.
- Natural companion metric for `/admin/authentication`: a per-area
  count/countdown of "accounts still on their legacy password, N days
  left," so the migration's tail is visible instead of silent.

## Phase 9 — A modular shape for "linked, but is it actually authorized" per area

Phase 6's admin rollup, taken at face value, risks showing "linked" as if
it meant "has access" — exactly the conflation the authentication-vs-
authorization section above warns about. This phase is what makes the
rollup (and any future area) show the real, separate answer without every
area re-inventing how.

- Each area keeps owning its own authorization *model* — Performance's
  per-company `companyRoles`/`permissions`, HR's boolean `applicantAccess`,
  whatever shape a future area genuinely needs. This plan does not force
  a shared schema; Performance's per-company RBAC and HR's single allowlist
  flag are different enough that squashing them into one table would lose
  information either one needs.
- What *is* shared: a small read-only projection each area exposes, in the
  same `getXSubprofile` shape `docs/architecture/profiles.md` already
  standardizes — e.g. `getPerformanceAccessSubprofile(ctx, userId)` /
  `getApplicantAccessSubprofile(ctx, userId)` — returning one normalized
  shape: `{ area, linked: boolean, status: "none" | "granted" | "revoked",
  level: string | null, grantedByUserId, grantedAt }`. `level` is an
  area-defined free string (a Performance role name, or `"vault"` for HR's
  single tier) — the rollup renders it, it doesn't interpret it.
- This is a **read projection only** — granting/revoking access keeps
  happening exactly where it does today (Performance's role-assignment
  admin UI, the Applicant Management access toggle). Nothing about *how*
  access is approved changes; this phase only makes the *current* state
  legible in one place instead of requiring a trip to each area's own
  admin page to find out.
- Phase 6's rollup consumes this: a row now reads "linked, no grant yet,"
  "linked, Performance role: Sales Manager," or "linked, HR vault: granted"
  — instead of a bare "linked" that an admin could misread as "has access."
- **The payoff for future areas** ("or future things," as asked): a new
  area that follows this convention from day one — its own authorization
  table/field plus one `getXSubprofile`-shaped projection function — shows
  up in the same rollup and the same auto-link/password-less/step-up
  machinery from Phases 1–8 for free, instead of needing its own bespoke
  admin page before anyone can tell who has access to it.

## Deliberately out of scope here

- **Deleting `passwordHash`/`applicantVaultPasswords` columns before Phase
  8's grace period ends.** Every phase up to 8 keeps the standalone-password
  path alive as a fallback; Phase 8 is the first phase that actually turns
  one off, and only after the fixed, communicated 30-day window.
- **Forcing passkey enrollment.** `authPolicy.requirePasskeyScope` already
  exists as an org-wide lever; this plan makes passkeys *more useful* once
  set up, it doesn't change whether they're required.
- **Replacing any area's existing authorization model.**
  `companyRoles`/`permissions` and `applicantAccess`/`applicantAccessDelegate`
  stay exactly as they are; Phase 9 adds a shared *read* projection over
  them, not a shared *grant* mechanism. Unifying how access is actually
  approved across areas — if that's ever wanted — is a separate, later
  decision with its own tradeoffs, not a side effect of this plan.

## Suggested order across the next several days

1. Phase 1 (auto-link) — small, mechanical, immediately reduces admin
   busywork independent of everything else.
2. Phase 2 (secondary emails) — the shared primitive every later phase
   needs; get the verification UX right once.
3. Phase 3 (Performance password-less linked accounts) together with
   Phase 7's forced first step-up and device-trust prompt — Phase 3 is what
   triggers that forced step-up, so ship them together for this area.
4. Phase 8 (30-day legacy grace period) for Performance — its clock starts
   the moment Phase 3 ships.
5. Phase 5 (reset routing) — falls out naturally once 2 and 3 exist.
6. Phase 4 (HR vault passkey option) together with the same Phase 7/8
   treatment as Performance — independent of 3/5, can slot in whenever.
7. Phase 9 (modular access-grant projection) — write
   `getPerformanceAccessSubprofile`/`getApplicantAccessSubprofile` once
   Phases 3/4 exist for both areas to project.
8. Phase 6 (admin rollup view) plus the `/admin/authentication` additions
   from Phase 7 — last, since they consume everything the earlier phases
   (Phase 9 included) produced.
