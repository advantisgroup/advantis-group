# Website inquiries

What happens to a contact form sent from the marketing site, from the
customer's side and from the team's. Before this, an inquiry was fire and
forget: one mail to the team inbox with the customer on CC, a row in Convex
that only knew `sent | failed`, and nothing in the intranet that ever read it.

## Who does what

```
customer (apps/marketing)                    team (apps/intranet)
  /contact ──POST /api/send──┐                 /inquiries (manage_inquiries)
  /account/submissions ──────┤                        │
  /account/submissions/[id] ─┤  marketing Elysia API  │ userQuery/userMutation
  /callback?token=… ─────────┤  (Clerk-authed, calls  │
                             └─ Convex with serverKey)│
                                        │             │
                        packages/convex/convex/marketing/
                          inquiries.ts   customer side, serverQuery/serverMutation
                          inbox.ts       staff side, can: "manage_inquiries"
                          account.ts     export / erase / consents for one customer
                          mail.ts        internal actions → apps/api /internal/notifications
                          lib/inquiry.ts pure helpers shared by all three apps
                                        │
                        apps/api  /internal/notifications (customer mails the team triggers)
                                  /webhooks/resend  (bounces, inbound replies)
                                  /webhooks/clerk   (user.deleted → detach)
```

The mails sent *while the customer is submitting* (team mail + customer
receipt) go out from the marketing API, as before. Every mail the *team*
triggers later (status change, reply, callback confirmed, forms reopened) goes
Convex internal action → apps/api `/internal/notifications`, the same path
every other transactional intranet mail uses.

## Data model

The table keeps its name, `emails`, so nothing already stored moves. New
fields are optional: rows written before them read back with the defaults
below.

| field | meaning | legacy default |
|---|---|---|
| `nr` | sequential number, shown as the reference `AG-0042` | backfilled by `sentAt` order |
| `status` | delivery of the *team* mail: `queued \| sent \| failed` | as stored |
| `copyStatus` | the customer receipt: `sent \| skipped \| delivered \| bounced` | none (unknown) |
| `state` | where the team is: `open \| in_progress \| answered \| closed \| withdrawn` | `open` |
| `locale` | site locale the form was sent from; every later mail uses it | `de` |
| `topicKey` | `withdrawal \| question \| legal` for "other" inquiries (not the translated label) | derived from `topic` where it matches |
| `desiredAt` + `timeZone` | callback time as epoch ms + the sender's IANA zone | parsed from `desiredDateTime` as Europe/Berlin |
| `callbackStatus` | `requested \| confirmed \| cancelled` | `requested` for callbacks |
| `callbackConfirmedAt` | the slot the team confirmed (epoch ms) | – |
| `actionTokenHash` / `actionTokenExpiresAt` | sha256 of the token in the callback mail's reschedule/cancel links (works signed out) | – |
| `seenAt`, `seenByUserId` | first time someone in the team opened it | – |
| `assignedToUserId`, `assignedAt` | who is on it | – |
| `firstResponseAt`, `closedAt`, `lastActivityAt` | timestamps for SLA and sorting | `lastActivityAt = sentAt` |
| `attachments` | `attachmentValidator[]`, signed-in customers only | – |
| `anonymizedAt` | set by the retention cron once personal fields are blanked | – |

`email` and `accountEmail` are stored lowercased (a one-time migration fixes
old rows). Indexes added: `by_nr`, `by_email_sentAt` (claims inquiries sent
signed out), `by_state_lastActivityAt` (staff inbox), `by_actionTokenHash`,
`by_lastActivityAt` (retention).

Two new tables:

- `inquiryEvents` — `{ inquiryId, type, state?, actor: "customer" | "staff" | "system", actorUserId?, at }`,
  index `by_inquiry_at`. `type` is one of `created, seen, state, assigned,
  reply, customer_reply, callback_confirmed, callback_cancelled,
  callback_rescheduled, resent, withdrawn`. The customer's timeline and the
  staff history are both read from here.
- `inquiryMessages` — `{ inquiryId, author: "staff" | "customer", staffUserId?, body, attachments?, via: "web" | "email", createdAt }`,
  index `by_inquiry_createdAt`. The reply thread.

`notifyEmails` gains `locale?` and `clerkUserId?`. `whitepaperLeads` gains
`withdrawnAt?`, `verifiedVia?: "account"` and `clerkUserId?`.

## States

What the customer sees is deliberately small — three words, like a help
desk, not the team's internal steps:

| state | customer label | who moves it there |
|---|---|---|
| `open` | Received | created |
| `in_progress` | In progress | staff |
| `answered` | Answered | staff reply, or staff |
| `closed` | Closed | staff, or customer "This solved it" |
| `withdrawn` | Withdrawn | customer "Withdraw", or cancelling a callback |

Customer transitions (server-side map in `inquiries.ts`): `open |
in_progress → withdrawn`; `answered → closed` ("This solved it");
`answered | closed → in_progress` ("I still need help", with a note that
becomes a customer message). Everything else is staff-only.

"Seen by our team" is a timeline entry (`seenAt`), not a state.

A state change the customer should hear about (`in_progress`, `answered`)
schedules one mail five minutes out; the action re-reads the row and only
sends if the state is still the one it was scheduled for, so a few quick
clicks in the inbox send nothing or one mail, never three.

## Reference, reply time, callback hours

All in `marketing/lib/inquiry.ts` (pure, no Convex imports), exported from
`@advantis/convex/marketing/inquiry` so the marketing app, the intranet and
apps/api format them the same way:

- `formatReference(nr)` → `AG-0042`.
- `replyDueAt(sentAt)` → the same time on the next business day in
  Europe/Berlin (weekends skipped). The copy everywhere says "usually within
  one business day" — not "24 hours", which is wrong every Friday.
- `CALLBACK_HOURS` (Mon–Fri 09:00–18:00 Europe/Berlin) and
  `isWithinCallbackHours(at)`. The API rejects a callback time in the past or
  outside the window; the form says so in one line under the field.
- `buildIcs({ uid, start, durationMinutes, title, description, method })` —
  a hand-built VCALENDAR (`METHOD:REQUEST` / `CANCEL`, UID = inquiry id, UTC
  times), used both for the browser's "Add to calendar" and the confirmation
  mail's attachment.

## Mails

| when | from | to | language | reply-to |
|---|---|---|---|---|
| submitted | marketing API | team inbox | German | the customer |
| submitted | marketing API | customer (receipt, unless skipped) | `locale` | the team inbox |
| state → in_progress / answered | apps/api | customer | `locale` | the team inbox |
| staff reply | apps/api | customer | `locale` | inbound address, if configured |
| callback confirmed / cancelled | apps/api | customer (+ .ics) | `locale` | the team inbox |
| forms reopened | apps/api | everyone on the notify list | their `locale` | – |

The receipt is skipped (and the success screen says so) past the per-address
copy limit, or when the customer turned "Email me a copy" off in
preferences. Its Resend tag `inquiry_id` lets `/webhooks/resend` set
`copyStatus` to `delivered`/`bounced`.

Replying from a mail client lands in the thread only when
`INQUIRY_INBOUND_DOMAIN` is set (reply-to `reply+<id>.<hmac>@<domain>`,
handled on Resend's `email.received` event). Without it, replies go to the
team inbox like any other mail.

The team gets a German mail with an "Open in intranet" link and an in-app
notification (`inquiry_new`) for everyone with `manage_inquiries`.

## Accounts

A customer's inquiries are the rows where any of these match: `clerkUserId`,
`accountEmail` in their verified addresses, or the contact `email` in their
verified addresses (so something sent signed out shows up once they sign up
with that address). Changing the primary address no longer hides history.

- Deleting the account from `/account/privacy` erases every marketing row for
  the person (inquiries, events, messages, notify list, whitepaper leads for
  their verified addresses) and then the Clerk user. Staff (anyone with an
  intranet `users` row) are refused; their account is managed in the
  intranet.
- A Clerk `user.deleted` from anywhere else only detaches rows
  (`clerkUserId`/`accountEmail` cleared) so the correspondence stays with the
  team.
- The retention cron blanks personal fields on inquiries with no activity for
  `INQUIRY_RETENTION_YEARS` (see `marketing/lib/inquiry.ts`) and sets
  `anonymizedAt`. Gated by `DISABLE_CRONS` like every other cron.

Needs a legal look before shipping: the retention period, the privacy policy
section on accounts, and letting a Clerk-verified address stand in for the
whitepaper double opt-in.
