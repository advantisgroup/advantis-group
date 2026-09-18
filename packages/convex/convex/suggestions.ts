// Moved to `suggestions/suggestions.ts`. Re-exported so the old `api.suggestions.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { create, list, update, toggleVote, remove } from "./suggestions/suggestions";
