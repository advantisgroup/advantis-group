// Moved to `guidebooks/pages.ts`. Re-exported so the old `api.guidebookPages.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { list, get, create, update, remove } from "./guidebooks/pages";
