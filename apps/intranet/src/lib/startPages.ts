/**
 * Valid values for a user's "start page" preference (userPreferences.startPage,
 * a free-form string server-side) — shared by the onboarding workspace-prefs
 * step and the Settings page so the picker's options can't drift out of sync
 * between the two, and so renaming a destination route only needs one edit.
 */
export const START_PAGES = [
  "/",
  "/calendar",
  "/clockodo",
  "/announcements",
  "/chat",
  "/files",
] as const;
