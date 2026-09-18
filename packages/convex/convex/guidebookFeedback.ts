// Moved to `guidebooks/feedback.ts`. Re-exported so the old `api.guidebookFeedback.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { getMine, set, stats } from "./guidebooks/feedback";
