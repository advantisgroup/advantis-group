# Profiles, Subprofiles, and Partial Types

How identity is modeled across the backend (`packages/convex`), and the
conventions any new feature that links back to an intranet account should
follow. Loosely inspired by how Discord's API always returns the same
shaped `User`/partial-`User` object regardless of which endpoint you hit.

## Vocabulary

- **Profile** — a `users` row (`packages/convex/convex/schema.ts`). The one
  canonical intranet identity, backed by Clerk. Every concept below links
  back to one, directly or indirectly.
- **Subprofile** — a feature's own identity-shaped record representing
  "this profile, in this feature's context." A subprofile may or may not be
  linked to a profile yet — a feature can know about a person before an
  intranet account exists for them. Examples:
  - The **Clockodo link** (`users.clockodoUserId`, mirrored onto
    `people.clockodoUserId` for ActivityTrack's poller —
    see `lib/clockodoId.ts`).
  - **ActivityTrack's `people`** table — a tracked coworker, who may or may
    not have an intranet account (`people.userId`).
  - **HumanResources' `employeeProfiles`** table — an HR record, which may
    or may not have an intranet account (`employeeProfiles.userId`).
  - **Chat's `conversationMembers`** — always linked (chat requires an
    account), but still a feature-owned per-conversation record distinct
    from the profile itself (role, read cursor, mute/pin state).

  Not every `v.id("users")` foreign key is a subprofile. `createdByUserId`,
  `authorUserId`, `reviewedByUserId` and similar audit references are just
  "who did this," not a feature's own notion of a person. Likewise, a 1:1
  profile extension with no independent identity concept
  (`userPreferences`, `tourProgress`) is not a subprofile — it's just more
  columns on the same profile.

- **Partial profile** — `lib/profile.ts`'s `PartialProfile`: the small,
  stable projection (`userId`, `name`, `email`, `avatarUrl`) used anywhere a
  full `Doc<"users">` isn't needed. This is the intranet's equivalent of
  Discord's partial user/guild objects. One canonical resolver
  (`toPartialProfile`), not a fresh hand-rolled name/avatar join per
  feature.

- **Enrichment** — a subprofile-fetching query always returns the same
  shape. When the underlying link or data doesn't exist (or a third-party
  fetch fails), the function still returns a fully-populated object with a
  `linked`/`status` discriminant and null'd-out detail fields — never a
  bare `null` for the whole object, and never a silently filtered-out row.

## Using `lib/profile.ts`

```ts
import { toPartialProfile, toPartialProfileOrNull, profileDisplayName, profileAvatarUrl } from "./lib/profile";

// Full projection, given a Doc<"users"> (or any Pick<> with the same fields):
const partial = await toPartialProfile(ctx, user);
// { userId, name, email, avatarUrl }

// Tolerating a missing/unlinked user:
const partialOrNull = await toPartialProfileOrNull(ctx, maybeUser);

// Just the name or just the avatar, when you don't need the whole object:
const name = profileDisplayName(user);
const avatarUrl = await profileAvatarUrl(ctx, user);
```

Prefer `PartialProfile` over inventing a `linkedXName: string` field —
returning the structured object (not a pre-flattened display string) lets
every consumer also get the avatar and email without a second round trip,
and keeps the "how do we resolve a display name" decision in one place.

## The enrichment convention, in practice

Before: `packages/convex/convex/integrations/clockodoAbsences.ts`'s
`resolveCaller` returned bare `null` for "no intranet user," and separately
expected callers to check `caller?.clockodoUserId` truthiness for "intranet
user, but no Clockodo link" — two different kinds of "missing" conflated
into one nullable field.

After: it returns one of three named, `returns`-validated shapes —
`{ status: "no_account" }`, `{ status: "unlinked", userId, name, isManager }`,
or `{ status: "linked", userId, name, clockodoUserId, isManager }` — so a
caller's `switch`/`if` on `status` is exhaustive and TypeScript enforces it.

The same convention fixed `roster` and `clockodoView.listWithLinks`, which
used to silently filter out every not-yet-linked user instead of including
them with `linked: false` — an admin auditing "who isn't connected to
Clockodo yet" could never see that from the data.

## Adding a new subprofile

1. Identify the feature-owned table/field that represents "this profile,
   in my feature" (or the join needed to resolve it).
2. Write one function — `getXSubprofile(ctx, userId)` — that is the single
   place this join happens. See `activity/people.ts`'s
   `getActivitySubprofile` for the pattern: it replaced three independent
   copies of the same `people.by_userId` lookup previously duplicated
   across `activity/state.ts`'s `myState`/`stateBatch`/`historyBatch`.
3. Give the return type a name and a matching `v.object(...)` validator
   (export both), with a `linked: boolean` (or an explicit `status` union
   for more than two states) — never a bare `null`, never an omitted row.
4. Add `returns:` to any query/mutation you touch while doing this. It's
   not (yet) a codebase-wide convention — see the note below — but it is
   the expected standard for new/touched subprofile code.
5. If a consumer (another Convex function, `apps/api`, or `apps/intranet`)
   depended on the old ad hoc shape, update it in the same change.

## `returns:` validators — current status

As of this doc, no Convex function in this codebase declares a `returns:`
validator — all output typing is implicit TypeScript inference with no
runtime enforcement. That's a pre-existing, codebase-wide gap, not
something this doc's conventions retrofit everywhere: adding `returns:` to
all ~500 existing functions is a separate, much larger mechanical task with
a different cost/benefit than the profile/subprofile work above.

Do add `returns:` to any function you touch as part of building or fixing a
subprofile — that's now the house-style expectation going forward, the
same way `args: {...v.*}` has always been mandatory.

## Where types live

`packages/convex` deliberately does not depend on `@advantis/types` — it's
bundled standalone for the Convex deployment. Canonical
Profile/Subprofile/Partial-profile types therefore live inside
`packages/convex/convex/lib/`, not in `packages/types`. If `apps/intranet`
or `apps/api` need one of these shapes, derive it from the Convex API
(`FunctionReturnType`/`FunctionArgs`) the way the intranet's
`FeatureFlagKey` does, rather than hand-syncing a copy.
