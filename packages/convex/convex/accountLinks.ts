// Moved to `security/accountLinks.ts`. Re-exported so the old `api.accountLinks.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { forUser } from "./security/accountLinks";
