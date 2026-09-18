// Moved to `notifications/notifications.ts`. Re-exported so the old `api.notifications.*`
// path keeps working for open tabs and queued jobs until the shim cleanup
// in docs/future-features/22_convex-restructure.md.
export {
  list,
  unreadCount,
  markRead,
  markAllRead,
  markUnread,
  snooze,
  resurface,
  remove,
  getPreferences,
  setPreferences,
  setDeliveryOption,
  queueDailyDigests,
  queueWeeklyReports,
} from "./notifications/notifications";
