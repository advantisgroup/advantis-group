# Data-access boundary

Every feature has one data path. Choose it from the kind of data, not from
which layer happens to be convenient to call.

## Convex

Use Convex directly from the intranet for data owned by this product when a
view should update as records change. Client components use `useQuery`,
`useMutation`, or `useAction` against the generated API; public Convex
functions authorize with `lib/auth.ts` first.

Convex remains the source of truth for intranet records, permissions, audit
data, and reactive ActivityTrack state. An action is appropriate when an
operation needs a Convex-side runtime, but it is not a substitute for a
third-party API client.

## apps/api

Use `apps/api` when a request crosses a service boundary: third-party APIs,
server-only credentials, webhook verification, file processing, or a
server-to-server relay. The intranet reaches those routes through the typed
Eden client; routes authenticate the Clerk request and apply the feature's
authorization before calling an external provider.

Each provider has one owned client object in `apps/api/src/lib`. It owns the
provider credentials, request format, upstream error translation, and any
provider-specific caching. Route handlers express product policy and DTOs;
they do not recreate provider request helpers.

## Combination flows

Some API routes need intranet identity or permissions before they can call an
external provider. In that case the route makes a server-key-gated Convex
lookup for just that product-owned information, then returns a DTO filtered
for the caller. Clockodo absences are the reference implementation:

`intranet -> apps/api -> Convex identity/capability lookup -> Clockodo client`

Do not mirror a third-party system into Convex merely to make an infrequent
read reactive. Mirror only when the product needs local history, realtime
updates, or a defined degraded-read mode during an upstream outage.
