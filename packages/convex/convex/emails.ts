// Moved to `marketing/emails.ts`. Re-exported so the old `api.emails.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md. Saving and listing
// inquiries now live in `marketing/inquiries.ts`.
export { saveNotifyEmail, deleteNotifyEmail } from "./marketing/emails";
