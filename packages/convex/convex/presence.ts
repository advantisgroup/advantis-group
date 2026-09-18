// Moved to `people/presence.ts`. Re-exported so the old `api.presence.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { heartbeat } from "./people/presence";
