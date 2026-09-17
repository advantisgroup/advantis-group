# Auth consolidation: fewer passwords, intranet account as the hub

The intranet (Clerk) account is already the most-verified identity in the
system — email, passkeys (`passkeys`), TOTP (`totpCredentials`), and the
centralized step-up engine (`lib/stepUp.ts`: `email_code < totp/recovery_code
< passkey`, `stepUpVerifications`/`stepUpAuditLog`). Three other areas each
grew their own password instead of leaning on it:

| Area                         | Credential                    | Linking today                                                                 |
| ----------------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| Performance dashboard         | `performanceLogins.passwordHash` | Optional `linkedUserId` → Clerk session auth via `performanceAuth.ts`'s `resolveActiveSession`; password stays live either way |
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

## Phase 1 — Auto-link at creation, not just after the fact

Closes the gap `14_identity-linking.md` already names.

- `performanceLogins` and `academyParticipants`: on create (and on a nightly
  reconciliation pass, for logins created before their intranet account
  existed), match `email` against `users.by_email` and set `linkedUserId`
  automatically. Keep the existing manual admin link as the fallback for a
  mismatched email (personal vs. work address, a typo, a legal-name change).
- Log the auto-link the same way `passwordResets.ts` distinguishes
  `autoApproved`/`autoApprovedVia` from a human decision — an
  `autoLinkedVia: "email_match"` field, so the admin UI can show "linked
  automatically" vs. "linked by an admin" without guessing.
- No behavior change yet for sign-in — this only makes `linkedUserId`
  reliably populated so the later phases have something to build on.

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
- `passwordResets.ts`'s `performance` scope then has fewer accounts to ever
  apply to — a linked, password-less login has nothing to reset. Update
  `resolveTarget`'s `performance` branch to say so plainly (surface "sign in
  with your intranet account" instead of a dead-end "no account found") for
  the case where the typed email is a verified secondary email with no
  password to reset.
- An admin can still force a standalone password back onto a linked account
  (contractor sharing a login, edge case where SSO-only is undesirable) —
  this is a default, not a removal of the escape hatch.

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

## Deliberately out of scope here

- **Deleting `passwordHash`/`applicantVaultPasswords` columns.** Every phase
  above keeps the standalone-password path alive as a fallback; removing it
  outright is a separate, later decision once real usage data shows how
  many accounts are still on it.
- **Single sign-on for the ActivityTrack tray-app debug password
  (`activitySettings`).** Called out in `docs/password-resets.md` as out of
  scope for the same reason it's out of scope here — it's one shared
  admin-set secret, not a per-person credential.
- **Forcing passkey enrollment.** `authPolicy.requirePasskeyScope` already
  exists as an org-wide lever; this plan makes passkeys *more useful* once
  set up, it doesn't change whether they're required.

## Suggested order across the next several days

1. Phase 1 (auto-link) — small, mechanical, immediately reduces admin
   busywork independent of everything else.
2. Phase 2 (secondary emails) — the shared primitive every later phase
   needs; get the verification UX right once.
3. Phase 3 (Performance password-less linked accounts) — highest-volume
   area, most visible win.
4. Phase 5 (reset routing) — falls out naturally once 2 and 3 exist.
5. Phase 4 (HR vault passkey option) — independent of 3/5, can slot in
   whenever.
6. Phase 6 (admin rollup view) — last, since it's a view over everything
   the earlier phases produced.
