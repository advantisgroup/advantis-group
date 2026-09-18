// Moved to `guidebooks/reads.ts`. Re-exported so the old `api.guidebookReads.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { listMine, markRead, listConfirmersForSlug } from "./guidebooks/reads";
