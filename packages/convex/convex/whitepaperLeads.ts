// Moved to `marketing/leads.ts`. Re-exported so the old `api.whitepaperLeads.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  saveRequest,
  markConfirmationSent,
  confirmRequest,
  markDelivered,
} from "./marketing/leads";
