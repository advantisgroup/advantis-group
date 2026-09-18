// Moved to `fehlermanagement/reports.ts`. Re-exported so the old `api.errorReports.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { list, create, update, remove } from "./fehlermanagement/reports";
