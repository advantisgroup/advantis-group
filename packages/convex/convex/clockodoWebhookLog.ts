// Moved to `integrations/clockodoWebhookLog.ts`. Re-exported so the old `api.clockodoWebhookLog.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export { pruneOldWebhookLogs } from "./integrations/clockodoWebhookLog";
