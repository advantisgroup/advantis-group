// Moved to `notifications/email.ts`. Re-exported so the old `api.outbound.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { sendNotificationEmail } from "./notifications/email";
