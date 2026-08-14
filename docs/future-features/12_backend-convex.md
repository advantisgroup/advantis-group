# Backend / Convex

Cross-cutting backend ideas for `packages/convex`, in support of the
feature ideas in the other files rather than standalone user-facing
features.

- **Full-text search indexes** — add Convex search indexes for chat
  messages and wiki entries to back the search features described in
  `02_chat.md` and `05_announcements-wiki-guidebooks.md`.
- **Scheduled digest crons** — extend `crons.ts` with the ActivityTrack,
  absence, and notification digest jobs described in `03_activitytrack.md`
  and `10_notifications.md`.
- **Webhook ingestion audit trail for new integrations** — reuse the
  pattern already established for Clockodo webhooks for any new external
  integration added under `13_apps-api-integrations.md`.
