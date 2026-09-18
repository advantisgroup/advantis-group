// Moved to `people/clerkSync.ts`. Re-exported so the old `api.clerkSync.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { syncFromClerk, deactivateFromClerk } from "./people/clerkSync";
