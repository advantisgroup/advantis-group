// Moved to `people/members.ts`. Re-exported so the old `api.members.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { remove, reinvite } from "./people/members";
