// Moved to `marketing/analytics.ts`. Re-exported so the old `api.marketingAnalytics.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { recordPageview, recordEvent, applyDuration, computeForPost } from "./marketing/analytics";
