import type { TourCheckpoint } from "./tour-types";

/**
 * Tour structure only — the user-facing copy (checkpoint labels, step titles
 * and descriptions) lives in the `Tour` i18n namespace, keyed by checkpoint id
 * (`Tour.checkpoints.<id>`) and step id (`Tour.steps.<stepId>.title` /
 * `.description`), so the tour follows the user's language preference.
 */
export const TOUR_CHECKPOINTS: TourCheckpoint[] = [
  {
    id: "dashboard",
    route: "/",
    steps: [
      {
        id: "dashboard.sidebar",
        targetAttr: "tour-sidebar",
        popoutSide: "right",
        route: "/",
        skipOnMobile: true,
      },
      {
        id: "dashboard.header",
        targetAttr: "tour-header",
        popoutSide: "bottom",
        route: "/",
      },
      {
        id: "dashboard.actions",
        targetAttr: "tour-dashboard-actions",
        popoutSide: "bottom",
        route: "/",
      },
      {
        id: "dashboard.main",
        targetAttr: "tour-dashboard-main",
        popoutSide: "top",
        route: "/",
      },
      {
        id: "dashboard.customize",
        targetAttr: "tour-dashboard-customize",
        popoutSide: "bottom",
        route: "/",
      },
    ],
  },
  {
    id: "announcements",
    route: "/announcements",
    steps: [
      {
        id: "announcements.nav",
        targetAttr: "tour-nav-announcements",
        popoutSide: "right",
        route: "/announcements",
        skipOnMobile: true,
      },
      {
        id: "announcements.toolbar",
        targetAttr: "tour-announcements-toolbar",
        popoutSide: "bottom",
        route: "/announcements",
      },
      {
        id: "announcements.list",
        targetAttr: "tour-announcements-list",
        popoutSide: "top",
        route: "/announcements",
      },
      {
        id: "announcements.new",
        targetAttr: "tour-announcements-new",
        popoutSide: "bottom",
        route: "/announcements",
        roles: ["manager"],
      },
    ],
  },
  {
    id: "calendar",
    route: "/calendar",
    steps: [
      {
        id: "calendar.nav",
        targetAttr: "tour-nav-calendar",
        popoutSide: "right",
        route: "/calendar",
        skipOnMobile: true,
      },
      {
        id: "calendar.toolbar",
        targetAttr: "tour-calendar-toolbar",
        popoutSide: "bottom",
        route: "/calendar",
      },
      {
        id: "calendar.filters",
        targetAttr: "tour-calendar-filters",
        popoutSide: "bottom",
        route: "/calendar",
      },
      {
        id: "calendar.view",
        targetAttr: "tour-calendar-view",
        popoutSide: "top",
        route: "/calendar",
      },
      {
        id: "calendar.add",
        targetAttr: "tour-calendar-add",
        popoutSide: "bottom",
        route: "/calendar",
        roles: ["manager"],
      },
    ],
  },
  {
    id: "absences",
    route: "/clockodo/requests",
    steps: [
      {
        id: "absences.nav",
        targetAttr: "tour-nav-absences",
        popoutSide: "right",
        route: "/clockodo/requests",
        skipOnMobile: true,
      },
      {
        id: "absences.stats",
        targetAttr: "tour-absences-new",
        popoutSide: "bottom",
        route: "/clockodo/requests",
      },
      {
        id: "absences.filters",
        targetAttr: "tour-absences-search",
        popoutSide: "bottom",
        route: "/clockodo/requests",
      },
      {
        id: "absences.list",
        targetAttr: "tour-absences-list",
        popoutSide: "top",
        route: "/clockodo/requests",
      },
    ],
  },
  {
    id: "chat",
    route: "/chat",
    steps: [
      {
        id: "chat.nav",
        targetAttr: "tour-nav-chat",
        popoutSide: "right",
        route: "/chat",
        skipOnMobile: true,
      },
      {
        id: "chat.list",
        targetAttr: "tour-chat-list",
        popoutSide: "right",
        route: "/chat",
      },
    ],
  },
  {
    id: "directory",
    route: "/directory",
    steps: [
      {
        id: "directory.nav",
        targetAttr: "tour-nav-directory",
        popoutSide: "right",
        route: "/directory",
        skipOnMobile: true,
      },
      {
        id: "directory.filters",
        targetAttr: "tour-directory-filters",
        popoutSide: "bottom",
        route: "/directory",
      },
      {
        id: "directory.grid",
        targetAttr: "tour-directory-grid",
        popoutSide: "top",
        route: "/directory",
      },
    ],
  },
  {
    id: "files",
    route: "/files",
    steps: [
      {
        id: "files.nav",
        targetAttr: "tour-nav-files",
        popoutSide: "right",
        route: "/files",
        skipOnMobile: true,
      },
      {
        id: "files.toolbar",
        targetAttr: "tour-files-toolbar",
        popoutSide: "bottom",
        route: "/files",
      },
      {
        id: "files.dropzone",
        targetAttr: "tour-files-upload",
        popoutSide: "bottom",
        route: "/files",
      },
      {
        id: "files.browser",
        targetAttr: "tour-files-browser",
        popoutSide: "top",
        route: "/files",
      },
    ],
  },
  {
    id: "guidebooks",
    route: "/guidebooks",
    steps: [
      {
        id: "guidebooks.nav",
        targetAttr: "tour-nav-guidebooks",
        popoutSide: "right",
        route: "/guidebooks",
        skipOnMobile: true,
      },
      {
        id: "guidebooks.list",
        targetAttr: "tour-guidebooks-list",
        popoutSide: "top",
        route: "/guidebooks",
      },
    ],
  },
  {
    id: "notifications",
    route: "/notifications",
    steps: [
      {
        id: "notifications.bell",
        targetAttr: "tour-notifications-btn",
        popoutSide: "bottom",
        route: "/notifications",
      },
      {
        id: "notifications.feed",
        targetAttr: "tour-notifications-feed",
        popoutSide: "top",
        route: "/notifications",
      },
      {
        id: "notifications.prefs",
        targetAttr: "tour-notifications-prefs",
        popoutSide: "top",
        route: "/notifications",
      },
    ],
  },
  {
    id: "settings",
    route: "/settings",
    steps: [
      {
        id: "settings.nav",
        targetAttr: "tour-nav-settings",
        popoutSide: "right",
        route: "/settings",
        skipOnMobile: true,
      },
      {
        id: "settings.profile",
        targetAttr: "tour-settings-profile",
        popoutSide: "bottom",
        route: "/settings",
      },
      {
        id: "settings.prefs",
        targetAttr: "tour-settings-app-prefs",
        popoutSide: "top",
        route: "/settings",
      },
      {
        id: "settings.connections",
        targetAttr: "tour-settings-connections",
        popoutSide: "top",
        route: "/settings",
      },
    ],
  },
  {
    id: "admin",
    route: "/admin",
    managerOnly: true,
    steps: [
      {
        id: "admin.nav",
        targetAttr: "tour-nav-admin",
        popoutSide: "right",
        route: "/admin",
        skipOnMobile: true,
      },
      {
        id: "admin.members",
        targetAttr: "tour-admin-members",
        popoutSide: "top",
        route: "/admin/members",
      },
    ],
  },
  {
    id: "activity",
    route: "/activity",
    managerOnly: true,
    steps: [
      {
        id: "activity.nav",
        targetAttr: "tour-nav-activity",
        popoutSide: "right",
        route: "/activity",
        skipOnMobile: true,
      },
      {
        id: "activity.stats",
        targetAttr: "tour-activity-stats",
        popoutSide: "bottom",
        route: "/activity",
      },
    ],
  },
];

export const ALL_CHECKPOINT_IDS = TOUR_CHECKPOINTS.map((c) => c.id);
