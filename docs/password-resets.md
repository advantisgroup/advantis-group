# Password resets for the non-Clerk password areas

Two areas keep a password of their own, outside Clerk:

| `o=` scope    | Area                                       | Password lives in         |
| ------------- | ------------------------------------------ | ------------------------- |
| `hr`          | Human Resources / Applicant Management vault | `applicantVaultPasswords` |
| `performance` | Performance login                          | `performanceLogins`       |

Neither can be recovered — both store a PBKDF2 hash and nothing else. This is
the flow that gets someone back in without anyone ever learning their password.

> The ActivityTrack tray-app debug password (`activitySettings`) is out of
> scope: it's one shared secret an admin sets, not a per-person credential, so
> "forgot mine" doesn't apply.

## The flow

1. **Failed attempt.** The forgot-password panel only renders after the lock
   screen has actually rejected a password. Offering it up front invites
   skipping the password instead of remembering it.
2. **Filing a ping** (`passwordResets.requestReset`). Changes nothing. Writes a
   `passwordResetRequests` row, notifies every active intranet admin in-app and
   by email. **One per account per 24 h**, keyed on the *account* rather than
   the filer so a second browser doesn't reset the clock.
3. **Admin review** at `/admin/password-resets` (Organization → Access &
   people, admin-only). The queue shows the account, the area, who filed it,
   and — loudly — whether those last two are the same person.
4. **Issuing a link** (`passwordResets.issueResetLink`). Mints a single-use
   token, valid **60 minutes**, and emails it to the **account holder's own
   address** — never to whoever filed the request. That's what makes an
   approved-but-impersonated request harmless.
5. **Consuming it** at `/password?o=<scope>&token=<token>`. Sets the new
   password, marks the token used, revokes the target's other outstanding
   tokens, and kills every session minted under the old password.

## Why it's shaped this way

- **No account-existence oracle.** A request for an email nobody owns gets the
  same response as a real one, and still writes a row (so repeated probing is
  visible in the queue) — but sends no admin email, so it can't be used to
  mail-bomb anyone.
- **Only the hash is stored.** `passwordResetTokens.tokenHash` is SHA-256; the
  plaintext exists solely in the emailed URL. A database read cannot be turned
  back into a working link, and an admin never sees one either.
- **Admins can trigger a reset, not perform one.** `issueResetLink` returns no
  token to its caller.
- **Email-code step-up** on both admin actions (issue *and* dismiss — quietly
  burying "someone is trying to get into the CFO's account" is its own kind of
  damage). See below.
- **The `o=` parameter is not trusted.** A token whose stored scope doesn't
  match reports as plain `invalid`, so the URL can't be used to ask which area
  a token belongs to.
- **`/password` is one route, not one per area,** deliberately outside both the
  Clerk gate (`proxy.ts`'s `PUBLIC_ROUTE_PREFIXES`) and the tenant rewrite: a
  Performance user resetting from their own company's domain has no intranet
  account to sign into first.

## Required setup

### Admin step-up: email code, not Clerk

Both admin actions used to lean on Clerk's step-up re-verification (the
`fva`/factor-verification-age claim), which turned out to be structurally
unworkable: Clerk's Dashboard rejects `fva` as a **custom** JWT Template claim
name outright ("You can't use the reserved claim: fva"), and Convex's SDK
independently strips any claim literally named `fva` from
`ctx.auth.getUserIdentity()`. A claim-renaming workaround
(`reverificationAge`) got it working, but it was still built on a claim path
Clerk doesn't officially support for hand-built templates.

The gate is now fully self-contained: `packages/convex/convex/lib/
adminVerification.ts` mails a 6-digit code to the **admin's own address**
(`admin.email`, never anything client-supplied) via the same Resend pipeline
as the reset links themselves (`outbound.sendNotificationEmail`, kind
`"admin-verification-code"`). `requestVerificationCode` issues and mails the
code (cooldown-limited); `submitVerificationCode` checks it (5 attempts, then
the code is invalidated and a fresh one has to be requested); a correct
code marks the admin "recently verified" for 10 minutes
(`REVERIFICATION_MAX_AGE_MINUTES`), which `isRecentlyVerified` reads to gate
`issueResetLink` and `dismissRequest`. No Clerk JWT Template configuration is
needed for this flow anymore.

**Without a verified code, both admin actions stay blocked.** That's
deliberate — a missing/expired/never-entered code is indistinguishable from
"never stepped up", and guessing permissively would silently turn the gate
off.

### Environment variables

| Variable                        | Where                | Purpose                                                             |
| ------------------------------- | -------------------- | ------------------------------------------------------------------- |
| `POSTHOG_KEY`                   | Convex deployment    | Server-side analytics. Same `phc_…` project key the browser uses.    |
| `POSTHOG_HOST`                  | Convex deployment    | Optional; defaults to `https://eu.i.posthog.com`.                    |
| `PASSWORD_RESET_CONTACT_EMAIL`  | Convex deployment    | Optional. Shown on the HR lock screen as "in a hurry, reach X".      |
| `INTERNAL_URL`                  | Convex deployment    | Already set. Base for reset links on the intranet host.              |

Set Convex vars with `npx convex env set NAME value` from `packages/convex`.
`apps/api` needs nothing new — it only renders and sends the three emails
(request notice, reset link, admin verification code) through its existing
`RESEND_API_KEY`.

## Logging

Three layers, none of which ever contain a token, a token hash, or a password:

- **`passwordResetAuditLog`** (Convex table) — the durable trail: every filing,
  cooldown rejection, admin decision, step-up failure, link opened and reset
  completed, with actor, target, `reverified`, and a short `detail`. Surfaced
  per request in the admin UI ("Trail"); outlives the request rows themselves,
  which the daily `purgeStale` cron trims after 180 days (tokens after 7).
- **Console** — `[passwordReset] …` lines from Convex and from `apps/api`'s
  Resend wrapper. Email addresses are masked to `k***@domain`.
- **PostHog** — `password_reset_*` events, from the browser
  (`password_reset_forgot_shown`, `_notify_clicked`, `_link_opened`,
  `_finished`, `_admin_action`) and from Convex (`password_reset_requested`,
  `_request_blocked`, `_link_issued`, `_request_dismissed`, `_completed`,
  `_reverification_required`). Server events use the Clerk user id as
  `distinct_id` so they join with the browser's.

## Adding a third area

1. Add the literal to `passwordResetScopeValidator` (`schema.ts`).
2. Add a branch to `resolveTarget` and to `applyReset` (`passwordResets.ts`).
3. Add a `SCOPE_LABEL` entry and an `AFTER_RESET_HREF` entry
   (`app/password/page.tsx`).
4. Render `<ForgotPasswordPanel scope="…" />` from that area's lock screen,
   gated on a failed attempt.

Nothing else about the flow is per-area.
