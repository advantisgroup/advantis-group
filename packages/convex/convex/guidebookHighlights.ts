// Moved to `guidebooks/highlights.ts`. Re-exported so the old `api.guidebookHighlights.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { list, toggle } from "./guidebooks/highlights";
