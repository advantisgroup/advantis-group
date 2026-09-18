// Moved to `fehlermanagement/settings.ts`. Re-exported so the old `api.errorSettings.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { get, update } from "./fehlermanagement/settings";
