// Moved to `org/delegations.ts`. Re-exported so the old `api.approvalDelegations.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { mine, listGranted, create, revoke } from "./org/delegations";
