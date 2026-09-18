// Moved to `wiki/formatSettings.ts`. Re-exported so the old `api.wikiFormatSettings.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { get, set } from "./wiki/formatSettings";
