// Moved to `updates/updates.ts`. Re-exported so the old `api.updates.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  previewEmailRecipients,
  create,
  publishFromMarkdown,
  publishScheduled,
  addTimelineEntry,
  update,
  remove,
  list,
  get,
  bannerActive,
  dismissBanner,
  recordEmailSendResults,
  recordEmailEvent,
} from "./updates/updates";
