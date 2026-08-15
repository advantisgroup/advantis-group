# Identity linking

`docs/architecture/profiles.md` establishes the canonical pattern: every
feature-owned "this profile, in my context" record should be a Subprofile
linked to a `users` row via `v.id("users")`, resolved through one
`getXSubprofile` function. A few modules predate that convention and still
key off a parallel identity instead — fixing that is what unlocks
directory-integrated UX for them, not a new UI layer bolted on top.

- **Sales Coach EV → `users`.** `salesCoachEvCalls`, `salesCoachEvWiki`, and
  `salesCoachEvSettings` all key off `clerkUserId: v.string()` directly
  instead of `v.id("users")`. Because of that, a person's coaching call
  history can't be resolved with a normal indexed join from their profile —
  it can't appear on their directory/manager view, and it can't reuse
  `PartialProfile` for name/avatar the way every other module does. Adding a
  proper `userId` (looked up once from `clerkUserId` at write time) would let
  Sales Coach EV plug into the same profile-enrichment pattern as everything
  else.
- **Performance employees → `users`.** `performanceEmployees` is just
  `{ name, active, companyId }` — no link to `users` at all. Call-report
  imports match agent names against this table by string
  (`performanceUploadLog.skippedNames` exists specifically to record names
  that *didn't* match). A typo or a legal-name change silently creates a
  second "employee" with a fresh, empty history. Adding an optional
  `userId` — even filled in lazily by an admin, like `academyParticipants`
  already does — would let performance history follow the person instead of
  the exact string in the last upload.
- **Academy/Performance logins → make linking automatic, not manual.**
  `academyParticipants.linkedUserId` and `performanceLogins.linkedUserId`
  both already support linking to an intranet account, but only via an
  admin manually clicking "link" after the fact. Auto-matching by email
  against `users.email` at creation time (with the manual override staying
  as a fallback) would mean these subprofiles show up linked from day one
  instead of admins having to remember to go back and connect them.
