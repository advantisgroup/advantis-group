# Convex Best Practices

Convex's own best-practices list, kept in-repo because `packages/convex` has
**no linter** (`packages/convex/package.json`'s `lint` script is literally
`echo "@advantis/convex: no lint"`) and none of the `@convex-dev/*` ESLint
rules that would catch these are installed. Nothing mechanical enforces any
of this today, so the checklist has to be applied by whoever is writing the
function.

Upstream: <https://docs.convex.dev/understanding/best-practices/>. When the
two disagree, upstream wins — but keep the repo notes in this file up to date
rather than deleting them, since they record deliberate local decisions.

Installed `convex` is **1.46.0**, so every API mentioned below, including the
table-name-first `ctx.db` argument, is available. Keep every package on the
same `convex` version: since 1.46 validators from different versions don't mix
in TypeScript.

## Where this repo currently stands

A snapshot, not a to-do list — most of these are fine as they are, and a few
are deliberate. Re-audit rather than trusting the counts if it matters.

| Practice | State |
| --- | --- |
| Argument validators on public functions | Followed — every `query`/`mutation`/`action` in `convex/` declares `args`. |
| Access control on public functions | Followed — the `user*`/`serverUser*` builders in `functions.ts` resolve the caller and check the declared `role`/`can`/`applicant` requirement before the handler runs. |
| Avoid `.filter` on db queries | Mostly followed — 9 remaining call sites (`people/accessRequests.ts`, `people/invites.ts`, `lib/auth.ts`, `performance/companies.ts`, `org/structureMigration.ts`, `performance/import.ts`, `migrations/backfillPerformanceCompanyId.ts`). |
| `.collect` only on small result sets | ~265 `.collect()` calls. Fine for the org-scale tables (`users`, `departments`, `presence`); worth checking before adding one on an append-only table (`auditLog`, `messages`). |
| Only schedule/`ctx.run*` **internal** functions | Deliberate exception: the `api*`-prefixed functions are public *by design* — `apps/api` calls them server-to-server behind `CONVEX_SERVER_KEY`. Action-side access checks go through the internal `users.callerForAction` (`lib/auth.ts`'s `requireCapabilityForAction` / `requireAdminForAction`). |
| Table name as first `ctx.db` argument | Not adopted — 0 of ~258 `ctx.db.get` calls pass one. Harmless today, required later for custom ID generation. |
| No `Date.now()` in queries | Not followed, mostly unavoidably — "is this person online right now", "is this measure overdue", "is this invite expired" are inherently clock-relative. See the [note below](#dont-use-datenow-in-queries). |

## Await all promises

### Why

Convex functions use `async`/`await`. If you don't await all your promises
(e.g. `await ctx.scheduler.runAfter`, `await ctx.db.patch`), you may run into
unexpected behavior (e.g. failing to schedule a function) or miss handling
errors.

### How

Upstream recommends typescript-eslint's
[`no-floating-promises`](https://typescript-eslint.io/rules/no-floating-promises/).

> **In this repo:** that rule is type-aware, and `oxlint` only runs
> type-aware rules through `oxlint-tsgolint` (already a root devDependency).
> `packages/convex` now has an `oxlint` script, but not with type-aware
> rules turned on, so until that's wired up it's a review concern.

## Avoid `.filter` on database queries

### Why

Filtering in code instead of using the `.filter` syntax has the same
performance, and is generally easier code to write. Conditions in
`.withIndex` or `.withSearchIndex` are more efficient than `.filter` or
filtering in code, so almost all uses of `.filter` should either be replaced
with a `.withIndex`/`.withSearchIndex` condition, or written as TypeScript
code.

### Example

```ts
// ❌
const tomsMessages = ctx.db
  .query("messages")
  .filter((q) => q.eq(q.field("author"), "Tom"))
  .collect();

// ✅ Option 1: use an index
const tomsMessages = await ctx.db
  .query("messages")
  .withIndex("by_author", (q) => q.eq("author", "Tom"))
  .collect();

// ✅ Option 2: filter in code
const allMessages = await ctx.db.query("messages").collect();
const tomsMessages = allMessages.filter((m) => m.author === "Tom");
```

### How

A regex like `\.filter\(\(?q` finds them all. Decide whether each should
become a `.withIndex` condition — if you are filtering over a large (1000+)
or potentially unbounded number of documents, it must be an index. If not,
filtering in code reads better and is more flexible.

Automatable via the
[`@convex-dev/no-filter-in-query`](https://docs.convex.dev/eslint#no-filter-in-query)
ESLint rule (not installed here).

### Exceptions

`.filter` on a paginated query (`.paginate`) has an advantage over filtering
in code: the paginated query returns the number of documents requested
*including* the filter condition, so filtering afterwards can yield a short
or even empty page. `.withIndex` on a paginated query is still better than
`.filter`.

## Only use `.collect` with a small number of results

### Why

Every result returned from `.collect` counts towards database bandwidth (even
ones a `.filter` then discards), and any change to any document in the result
re-runs the query or conflicts the mutation.

If the result set could be large (say 1000+ documents), narrow it with an
index first, or avoid loading everything — paginate, denormalize, or change
the feature.

### Examples

Using an index:

```ts
// ❌ potentially unbounded
const allMovies = await ctx.db.query("movies").collect();
const byDirector = allMovies.filter((m) => m.director === "Steven Spielberg");

// ✅ bounded by the index condition
const byDirector = await ctx.db
  .query("movies")
  .withIndex("by_director", (q) => q.eq("director", "Steven Spielberg"))
  .collect();
```

Using pagination:

```ts
// ❌ potentially unbounded
const watched = await ctx.db
  .query("watchedMovies")
  .withIndex("by_user", (q) => q.eq("user", "Tom"))
  .collect();

// ✅ recently watched first, a page at a time
const watched = await ctx.db
  .query("watchedMovies")
  .withIndex("by_user", (q) => q.eq("user", "Tom"))
  .order("desc")
  .paginate(paginationOptions);
```

Using a limit, or denormalizing the count:

```ts
// ✅ show "99+" instead of loading every document
const watched = await ctx.db
  .query("watchedMovies")
  .withIndex("by_user", (q) => q.eq("user", "Tom"))
  .take(100);
const count = watched.length === 100 ? "99+" : String(watched.length);

// ✅ or keep the count in its own table
const count = await ctx.db
  .query("watchedMoviesCount")
  .withIndex("by_user", (q) => q.eq("user", "Tom"))
  .unique();
```

### How

Search for `.collect(` and think about whether the result set is small. The
dashboard's Function Health page surfaces the expensive ones.

Automatable via
[`@convex-dev/no-collect-in-query`](https://docs.convex.dev/eslint#no-collect-in-query)
(not installed here). The
[aggregate component](https://www.npmjs.com/package/@convex-dev/aggregate) and
[database triggers](https://stack.convex.dev/triggers) are the usual
denormalization tools.

> **In this repo:** the distinction that matters is org-scale vs. append-only.
> `users`, `departments`, `teams`, `presence`, `featureFlags`,
> `integrationHealth` and the various `*Categories` tables have one row per
> person or per configured thing — collecting them is correct and several
> queries depend on it. The tables that grow without bound are
> `messages`, `auditLog`/`onedriveAudit`/`integrationsAuditLog`,
> `notifications`, `clockodoWebhookLog` and `integrationsRawDebugLog`. Reach for `.take()` on an index (newest-first,
> so truncation drops the oldest rows rather than the newest) or
> `.paginate()` on those, never `.collect()`.

### Exceptions

If you genuinely need to load a large number of documents — a migration, a
summary rollup — do it from an action that loads them in batches via separate
queries/mutations.

## Check for redundant indexes

### Why

`by_foo` and `by_foo_and_bar` are usually redundant: you only need
`by_foo_and_bar`, because a query can use a prefix of an index's fields.
Fewer indexes means less storage and less write overhead.

```ts
// ✅ one index serves both reads — just omit the `user` condition
const allTeamMembers = await ctx.db
  .query("teamMembers")
  .withIndex("by_team_and_user", (q) => q.eq("team", teamId))
  .collect();

const currentTeamMember = await ctx.db
  .query("teamMembers")
  .withIndex("by_team_and_user", (q) =>
    q.eq("team", teamId).eq("user", currentUserId),
  )
  .unique();
```

### How

Read through `packages/convex/convex/schema.ts` (or the dashboard) looking
for an index whose fields are a prefix of another's.

### Exceptions

`.index("by_foo", ["foo"])` is really an index on `foo` *and* `_creationTime`,
while `.index("by_foo_and_bar", ["foo", "bar"])` indexes `foo`, `bar`, and
`_creationTime`. If you need results sorted by `foo` then `_creationTime`,
you need both. For example `by_channel` can fetch the most recent messages in
a channel; `by_channel_and_author` cannot, because it sorts by author first.

## Use argument validators for all public functions

### Why

Public functions can be called by anyone, including someone probing for a way
to break the app. [Argument validators](https://docs.convex.dev/functions/validation)
(and return-value validators) keep the traffic to what you expect.

### Example

```ts
// ❌ `id` and `update` are unvalidated — a client can pass any Convex value,
//    and `update` could carry fields other than title/director.
export const updateMovie = mutation({
  handler: async (ctx, { id, update }: {
    id: Id<"movies">;
    update: Pick<Doc<"movies">, "title" | "director">;
  }) => {
    await ctx.db.patch("movies", id, update);
  },
});

// ✅ only a movies id, and only those two fields
export const updateMovie = mutation({
  args: {
    id: v.id("movies"),
    update: v.object({ title: v.string(), director: v.string() }),
  },
  handler: async (ctx, { id, update }) => {
    await ctx.db.patch("movies", id, update);
  },
});
```

### How

Check that every `query`, `mutation` and `action` declares `args`.
Automatable via
[`@convex-dev/require-argument-validators`](https://docs.convex.dev/eslint#require-argument-validators).

HTTP actions get no validator for free — validate the request body yourself
(upstream suggests [Zod](https://zod.dev), which is already a
`packages/convex` dependency).

> **In this repo:** `convex/http.ts` is the one place this applies — its
> unauthenticated `/analytics/duration` beacon validates the body with Zod.

## Use some form of access control for all public functions

### Why

If part of the app should only work when signed in, every Convex function
behind it must check that. Access-control checks must use
`ctx.auth.getUserIdentity()` or an unguessable argument (a UUID, or a Convex
ID that is never exposed to any other client) — never a spoofable argument
like an email.

Favoring granular functions (`setTeamOwner`) over broad ones (`updateTeam`)
lets each one check exactly the right thing.

### Example

```ts
// ❌ no check at all — anyone with the ID can write
export const updateTeam = mutation({
  args: { id: v.id("teams"), update: v.object({ name: v.optional(v.string()) }) },
  handler: async (ctx, { id, update }) => {
    await ctx.db.patch("teams", id, update);
  },
});

// ❌ checks access, but against a spoofable `email` argument
export const updateTeam = mutation({
  args: { /* … */ email: v.string() },
  handler: async (ctx, { id, update, email }) => {
    const members = /* load team members */;
    if (!members.some((m) => m.email === email)) throw new Error("Unauthorized");
    await ctx.db.patch("teams", id, update);
  },
});

// ✅ uses ctx.auth, which cannot be spoofed
export const updateTeam = mutation({
  args: { id: v.id("teams"), update: v.object({ name: v.optional(v.string()) }) },
  handler: async (ctx, { id, update }) => {
    const user = await ctx.auth.getUserIdentity();
    if (user === null) throw new Error("Unauthorized");
    const isTeamMember = /* check membership */;
    if (!isTeamMember) throw new Error("Unauthorized");
    await ctx.db.patch("teams", id, update);
  },
});
```

### How

Every `query`, `mutation`, `action` and `httpAction` needs a gate. Helper
functions for the common checks (`isTeamMember`, `loadTeam` that throws) keep
this from being repetitive. Some apps use
[row-level security](https://stack.convex.dev/row-level-security) instead of
per-function checks.

> **In this repo:** both, in one place. The builders in `functions.ts`
> (`userQuery`, `userMutation`, `userAction` and their `serverUser*` twins)
> resolve the person once into `ctx.caller` (`lib/caller.ts`) and check what
> the function declares — `role: "manager"`, `can: "manage_blog"`,
> `applicant: "access"` — before the handler runs. Inside, ask
> `ctx.caller.can(…)` / `.owns(id)` for "reveal more of the record" decisions.
> The same builders apply a row-level rule that hides trashed rows
> (`lib/trash.ts`). Don't hand-roll a `ctx.auth` check.
>
> `apps/api`'s server-key-gated endpoints layer their own gate on top and are
> worth reading before touching.

## Only schedule and `ctx.run*` internal functions

### Why

Public functions can be called by anyone and need careful auditing. Functions
only called from within Convex should be `internalQuery`/`internalMutation`/
`internalAction` so Convex itself guarantees nothing external can reach them.

### How

Search for `ctx.runQuery`, `ctx.runMutation`, `ctx.runAction`, `ctx.scheduler`
and check `crons.ts`. All of them should reference `internal.foo.bar`, not
`api.foo.bar`.

To share logic between a public and an internal function, extract a plain
helper both call; the public one carries the extra access-control checks.

### Example

```ts
// ❌ cron invoking a public mutation
crons.daily(
  "send daily reminder",
  { hourUTC: 17, minuteUTC: 30 },
  api.messages.sendMessage,
  { author: "System", body: "Share your daily update!" },
);

// ✅ shared helper, public wrapper for users, internal wrapper for the cron
async function sendMessageHelper(ctx: MutationCtx, args: { body: string; author: string }) {
  // add message to the database
}

export const sendMessage = mutation({
  args: { body: v.string() },
  handler: async (ctx, { body }) => {
    const user = await ctx.auth.getUserIdentity();
    if (user === null) throw new Error("Unauthorized");
    await sendMessageHelper(ctx, { body, author: user.name ?? "Anonymous" });
  },
});

export const sendInternalMessage = internalMutation({
  // `author` can't be spoofed here — internal functions aren't reachable externally
  args: { body: v.string(), author: v.string() },
  handler: async (ctx, { body, author }) => sendMessageHelper(ctx, { body, author }),
});

crons.daily(
  "send daily reminder",
  { hourUTC: 17, minuteUTC: 30 },
  internal.messages.sendInternalMessage,
  { author: "System", body: "Share your daily update!" },
);
```

> **In this repo — deliberate exception:** the `api*`-prefixed functions
> across `integrations/onedrive.ts`, `hr/applicants.ts`, `hr/employees.ts` and
> `integrations/clockodoAbsences.ts` are public on purpose. `apps/api` is a
> separate service, so it cannot call `internal.*` — the `api` prefix in the *name* marks "reached from apps/api, guarded by a
> server key," and the guard is inside the handler. Don't "fix" these to
> `internal`; you'll break the integration relays.
>
> The genuinely reviewable ones are the intra-Convex `ctx.runQuery(api.…)`
> calls: `blog/analytics.ts` reading `api.blog.posts.get` is the one left.
> The action-side access checks
> that used to round-trip through `api.users.me` now go through `userAction`,
> which reads the internal `users.callerForAction`.

## Use helper functions to write shared code

### Why

Most logic should be plain TypeScript functions, with `query`/`mutation`/
`action` as thin wrappers. Upstream's convention is a `convex/model`
directory holding the logic, and short public entry points that mostly just
call into it. Organizing this way makes most of the other refactors on this
list easy.

### Example

The anti-pattern overuses `ctx.runQuery`/`ctx.runMutation` (see the next
section):

```ts
// ❌
export const listMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const user = await ctx.runQuery(api.users.getCurrentUser);
    const conversation = await ctx.db.get("conversations", conversationId);
    if (conversation === null || !conversation.members.includes(user._id)) {
      throw new Error("Unauthorized");
    }
    return /* query ctx.db to load the messages */;
  },
});
```

Refactored, the access check and the read are helpers, and the public API is
almost empty:

```ts
// convex/model/conversations.ts
export async function ensureHasAccess(
  ctx: QueryCtx,
  { conversationId }: { conversationId: Id<"conversations"> },
) {
  const user = await Users.getCurrentUser(ctx);
  const conversation = await ctx.db.get("conversations", conversationId);
  if (conversation === null || !conversation.members.includes(user._id)) {
    throw new Error("Unauthorized");
  }
  return conversation;
}

export async function listMessages(ctx: QueryCtx, args: { conversationId: Id<"conversations"> }) {
  await ensureHasAccess(ctx, args);
  return /* query ctx.db to load the messages */;
}

// convex/conversations.ts
export const listMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: (ctx, args) => Conversations.listMessages(ctx, args),
});
```

See Convex's [TypeScript page](https://docs.convex.dev/understanding/best-practices/typescript)
for the useful types (`QueryCtx`, `MutationCtx`, `ActionCtx`, `Doc`, `Id`).

> **In this repo:** the same idea, different layout — there is no
> `convex/model`. Shared logic lives in `convex/lib/*` (`auth.ts`,
> `users.ts`, `profile.ts`, `clockodoId.ts`) and in per-feature `lib/`
> folders (`convex/performance/lib/`, `convex/hr/lib/`). Follow the existing
> layout rather than introducing `model/` alongside it.

## Use `runAction` only when crossing runtimes

### Why

`runAction` costs a whole extra function call with its own memory and CPU,
while the parent action sits idle waiting. Almost every `runAction` should be
a plain TypeScript function call instead. The exception is calling Node.js
code from the Convex runtime (e.g. a library that needs Node).

### Example

```ts
// ❌
await Promise.all(
  pages.map((page) => ctx.runAction(internal.scrape.scrapeSinglePage, { url: page })),
);

// ✅ plain function taking ActionCtx
export async function scrapeSinglePage(ctx: ActionCtx, { url }: { url: string }) {
  const page = await fetch(url);
  await ctx.runMutation(internal.scrape.addPage, { url, text: /* parse */ });
}

await Promise.all(pages.map((page) => Scrape.scrapeSinglePage(ctx, { url: page })));
```

### How

For each `runAction`, check whether the callee uses the same runtime as the
caller; if so, inline it as a helper. Keeping Node-only functions in their own
directory makes these easy to spot.

## Avoid sequential `ctx.runMutation` / `ctx.runQuery` from actions

### Why

Each `ctx.runQuery`/`ctx.runMutation` is its own transaction, so two calls in
a row are not consistent with each other. One combined call is.

### Example — queries

```ts
// ❌ the assertion can fail if the team changed between the two queries
const team = await ctx.runQuery(internal.teams.getTeam, { teamId });
const teamOwner = await ctx.runQuery(internal.teams.getTeamOwner, { teamId });
assert(team.owner === teamOwner._id);

// ✅ one transaction, one consistent result
const { team, owner } = await ctx.runQuery(internal.teams.getTeamAndOwner, { teamId });
assert(team.owner === owner._id);
```

### Example — loops

```ts
// ❌ one transaction per row: no atomicity
for (const member of teamMembers) {
  await ctx.runMutation(internal.teams.insertUser, member);
}

// ✅ one mutation inserts all of them in one transaction
await ctx.runMutation(internal.teams.insertUsers, teamMembers);
```

### How

Look for two or more `ctx.runQuery`/`ctx.runMutation` calls in a row with no
other code between them, and merge them.

### Exceptions

Intentionally exceeding one transaction's limits (a migration, an
aggregation) is a legitimate reason to loop. So is doing a side effect
between the calls — read data, hand it to an external service, write the
result back — which is the normal shape of every integration poller.

> **In this repo:** `performance/import.ts` is the batched-migration shape.

## Use `ctx.runQuery` / `ctx.runMutation` sparingly *inside* queries and mutations

### Why

Within a query or mutation these do run in the same transaction and give
consistent results, but they carry overhead a plain TypeScript function
doesn't. Wanting a helper is far more common than needing `ctx.run*`.

### Exceptions

- Convex components require `ctx.runQuery`/`ctx.runMutation`.
- Partial rollback on error needs `ctx.runMutation`, because a plain helper's
  writes can't be rolled back independently:

```ts
export const trySendMessage = mutation({
  args: { body: v.string(), author: v.string() },
  handler: async (ctx, { body, author }) => {
    try {
      await ctx.runMutation(internal.messages.sendMessage, { body, author });
    } catch (e) {
      // records the failure, but rolls back sendMessage's writes
      await ctx.db.insert("failures", { kind: "MessageFailed", body, author, error: `${e}` });
    }
  },
});
```

## Always include the table name when calling `ctx.db` functions

### Why

Since `convex` 1.31.0, `ctx.db.get`/`patch`/`replace`/`delete` accept a table
name as the first argument. It's optional today, but it's an extra safeguard
and it will be **required** for custom ID generation later.

### Example

```ts
// ❌
await ctx.db.get(movieId);
await ctx.db.patch(movieId, { title: "Whiplash" });
await ctx.db.delete(movieId);

// ✅
await ctx.db.get("movies", movieId);
await ctx.db.patch("movies", movieId, { title: "Whiplash" });
await ctx.db.delete("movies", movieId);
```

### How

Automatable via
[`@convex-dev/explicit-table-ids`](https://docs.convex.dev/eslint#explicit-table-ids),
which has an autofix, or the `@convex-dev/codemod` standalone tool.
([Background.](https://news.convex.dev/db-table-name/))

> **In this repo:** not adopted anywhere yet — roughly 258 `ctx.db.get` calls
> and none pass a table name. This is the one item on the list worth doing as
> a single mechanical codemod commit rather than drifting into it file by
> file, so a mixed-style codebase doesn't make the remaining call sites hard
> to find. Until that happens, matching the surrounding style (no table name)
> is the consistent choice.

## Don't use `Date.now()` in queries

### Why

Convex re-runs a subscribed query when the *data it read* changes — not when
the clock advances, since re-running every query every millisecond isn't
viable. A query that depends on the current time can therefore return stale
results.

`Date.now()` also hurts the query cache. Convex normally reuses a result when
the same query is called with the same arguments; a clock-dependent query has
to be invalidated frequently to avoid serving results that are too old, which
means more database work for no benefit.

### Example

```ts
// ❌
const releasedPosts = await ctx.db
  .query("posts")
  .withIndex("by_released_at", (q) => q.lte("releasedAt", Date.now()))
  .take(100);

// ✅ `isReleased` is flipped by a scheduled function once `releasedAt` passes
const releasedPosts = await ctx.db
  .query("posts")
  .withIndex("by_is_released", (q) => q.eq("isReleased", true))
  .take(100);
```

### How

Search for `Date.now()` in queries, and in helpers those queries call.

Two fixes:

1. Store a coarser boolean/bucket field on the document and flip it from a
   [scheduled function](https://docs.convex.dev/scheduling/scheduled-functions).
   The query cache then only invalidates when data actually changes.
2. Pass the target time in from the client as an explicit argument. Round it
   down (to the minute, or the day) so every request within that period shares
   one cache entry.

> **In this repo:** widely used, and often unavoidable — overdue/expiry checks
> (`errorMeasures.dueAt`, `invites.expiresAt`, presence `lastActiveAt`
> windows) are inherently clock-relative. Treat this as a "don't make it worse" rule:
>
> - Don't put `Date.now()` inside a `.withIndex` range bound in a query. That
>   makes the read range itself move continuously. Take the bound as an
>   argument instead — `org/overview.ts`'s `timelines` does this, deriving its
>   window from a client-supplied `tzOffsetMinutes` plus a `days` count.
> - Comparing `Date.now()` against a field on rows you already read (to label
>   something overdue) is the cheap case; it doesn't change what was read.
> - When a client passes a time argument, round it (to the minute or the local
>   day) so subscribers share cache entries rather than each minting their own.
