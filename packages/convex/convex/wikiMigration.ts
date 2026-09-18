// Moved to `wiki/migration.ts`. Re-exported so the old `api.wikiMigration.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { status, run } from "./wiki/migration";
