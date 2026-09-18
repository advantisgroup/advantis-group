// Moved to `wiki/categories.ts`. Re-exported so the old `api.wikiCategories.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { list, ensureDefaults, create, rename, cycleColor, remove } from "./wiki/categories";
