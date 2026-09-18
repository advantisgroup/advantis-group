// Moved to `fehlermanagement/categories.ts`. Re-exported so the old `api.errorCategories.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { list, create, rename, remove } from "./fehlermanagement/categories";
