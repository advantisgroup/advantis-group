// Moved to `performance/roles.ts`. Re-exported so the old `api.companyRoles.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { list, create, update, remove } from "./performance/roles";
