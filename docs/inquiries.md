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
| `ref` | the reference, lowercased: the shortest unique end of the id, at least 6 characters (`#841KGR`) | `migrations/backfillInquiries.refs`; until then the last 6 characters of the id |
| `nr` | sequential number, briefly shown as `AG-0042`; still resolves, no longer shown | backfilled by `sentAt` order |
| `status` | the *team* mail: `queued \| sent \| delivered \| delayed \| bounced \| failed` | as stored |
| `deliveredAt`, `attempts`, `lastAttemptAt` | when the team mail landed, and how many sends it took | `attempts = 1` |
| `failureReason` | plain category for a failed/bounced team mail (see "Status tracks") | – |
| `copyStatus` | the customer receipt: `sent \| skipped \| delivered \| delayed \| bounced \| failed` | none (unknown) |
| `copySkipReason`, `copyFailureReason`, `copyDeliveredAt` | why a receipt was skipped (`limit \| preference`) or didn't arrive | – |
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
old rows). Indexes added: `by_ref`, `by_nr`, `by_email_sentAt` (claims inquiries sent
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

- `referenceOf(row)` → `#841KGR`: the stored `ref`, or the id's last six
  characters for rows from before it was stored. `assignRef` (in
  `inquiries.ts`) stores it on create: six characters, one more for as long as
  another inquiry (or an older unstored one) already answers to it.
- The intranet opens `/inquiries/<id | #841KGR | 841kgr | AG-0042>` and
  redirects to the id URL; `/inquiries#841KGR` starts a search for it.
  `inbox.search` matches every typed word against the reference, id, name,
  addresses, company, phone (also as bare digits and in `0…` form for `+49`
  numbers), subject, topic, message and notes of the 1,000 most recent
  inquiries, plus an exact reference or id at any age.
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
preferences. Both submission mails carry Resend tags `inquiry_id` and
`mail` (`team` | `receipt`), so `/webhooks/resend` can move `status` or
`copyStatus` on to `delivered`, `delayed` or `bounced`.

Replying from a mail client lands in the thread only when
`INQUIRY_INBOUND_DOMAIN` is set (reply-to `reply+<id>.<hmac>@<domain>`,
handled on Resend's `email.received` event). Without it, replies go to the
team inbox like any other mail.

The team gets a German mail with an "Open in intranet" link and an in-app
notification (`inquiry_new`) for everyone with `manage_inquiries`.

## Status tracks

Anything on the customer side that moves through steps is shown as one
horizontal track of checkpoints (`components/account/Checkpoints.tsx` in
apps/marketing): a hairline with a dot per step, the step's label and time
under it. Done steps are filled, the current one is ringed, later ones are
hollow, a failed one is the destructive colour. Under a failed or stuck
checkpoint the track opens a panel: what went wrong in plain words, what we
already tried ("Tried 2 times · last at 14:02"), and the one thing to do
next. Below `sm` the same steps stack vertically.

| track | checkpoints | off-ramps |
|---|---|---|
| inquiry | Received → Seen → In progress → Answered | Withdrawn, Closed |
| team mail | Queued → Sent → Delivered | Failed, Delayed, Bounced |
| your copy | Sent → Delivered | Skipped, Delayed, Bounced, Failed |
| callback | Requested → Confirmed → Done | Cancelled, Rescheduled |
| whitepaper | Requested → Confirmed → Sent | Link expired, Not delivered |

The inquiry track leads the inquiry page. The two mail tracks sit together
under it as "Delivery", folded into one quiet line ("Delivered to our team ·
copy delivered to you") while nothing is wrong, and open by default when
something is. The callback track replaces the plain "Requested time" row on
callbacks; the whitepaper track lives on `/account/downloads`.

`failureReason` / `copyFailureReason` are categories the customer can act
on; the raw provider text stays in `error` and never reaches the browser:

| category | from | what the customer reads | action |
|---|---|---|---|
| `invalid_address` | Resend validation error on the address | The address looks wrong | Fix it and send again |
| `mailbox_unavailable` | permanent bounce | That mailbox doesn't accept mail | Use another address |
| `temporary` | transient bounce, `delivery_delayed` | Their server is slow to accept it | Nothing — we keep trying |
| `rate_limited` | 429 / quota | We were sending too much at once | Send again in a minute |
| `provider_error` | 5xx, network | Our mail service had a hiccup | Send again |
| `unknown` | anything else | It didn't go through | Send again, or call us |

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

## Privacy decisions

Made without a lawyer, on the conservative side. Revisit them when the company
has legal counsel; each is one setting or one paragraph.

- **Inquiry retention: 3 years without activity**, then personal fields are
  blanked (`INQUIRY_RETENTION_YEARS`). That's the regular limitation period for
  contract claims (§ 195 BGB). Inquiries that become business correspondence
  live on in the team inbox/CRM under § 257 HGB / § 147 AO, not in this table.
- **Whitepaper requests:** unconfirmed ones are deleted after 30 days; confirmed
  consent stays while it's in use; after a withdrawal the consent record is kept
  for the same 3 years as proof (Art. 7(1) GDPR), then deleted
  (`marketing/retention.ts → purgeLeads`).
- **Signed-in whitepaper requests skip the mailed confirmation.** A verified
  address in the account proves ownership the same way the link does; the row
  records `verifiedVia: "account"`, `clerkUserId`, `consentVersion` and the IP
  as the proof.
- **Visitor statistics are kept 14 months** (`purgeAnalytics`), and the session
  id lives in memory only. `sessionStorage` would count as storing information on
  the device (§ 25 TDDDG) and need consent; a JS variable doesn't. Remembering
  the chosen language and a half-written contact form stay in browser storage.
  Both are strictly necessary for something the visitor asked for.
- **US providers** (Vercel, Clerk, Convex, Resend, Upstash): the privacy policy
  names the EU–US Data Privacy Framework where a provider is certified and the
  Standard Contractual Clauses in its DPA otherwise. **This is only true once
  each provider's data processing agreement has been accepted** in its dashboard.
