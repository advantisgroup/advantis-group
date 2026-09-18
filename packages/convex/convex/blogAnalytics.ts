// Moved to `blog/analytics.ts`. Re-exported so the old `api.blogAnalytics.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { getForPost } from "./blog/analytics";
