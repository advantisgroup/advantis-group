// Moved to `updates/email.ts`. Re-exported so the old `api.updatesEmail.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { sendBulk } from "./updates/email";
