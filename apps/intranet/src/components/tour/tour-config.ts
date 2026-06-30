import type { TourCheckpoint } from "./tour-types";

export const TOUR_CHECKPOINTS: TourCheckpoint[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    route: "/",
    steps: [
      {
        id: "dashboard.sidebar",
        targetAttr: "tour-sidebar",
        title: "Your navigation",
        description:
          "Everything you need is in this sidebar. Quick access to all intranet sections.",
        popoutSide: "right",
        route: "/",
        skipOnMobile: true,
      },
      {
        id: "dashboard.header",
        targetAttr: "tour-header",
        title: "Quick actions",
        description:
          "Notifications, settings, and your account are always available up here.",
        popoutSide: "bottom",
        route: "/",
      },
      {
        id: "dashboard.main",
        targetAttr: "tour-dashboard-main",
        title: "Your dashboard",
        description:
          "A snapshot of what's happening — upcoming events, latest news, and pending items.",
        popoutSide: "top",
        route: "/",
      },
    ],
  },
  {
    id: "announcements",
    label: "Announcements",
    route: "/announcements",
    steps: [
      {
        id: "announcements.nav",
        targetAttr: "tour-nav-announcements",
        title: "Company announcements",
        description:
          "Stay up to date with news and updates from across the organisation.",
        popoutSide: "right",
        route: "/announcements",
        skipOnMobile: true,
      },
      {
        id: "announcements.list",
        targetAttr: "tour-announcements-list",
        title: "The announcements feed",
        description:
          "Posts appear here in order. You can react with emoji and see attached files.",
        popoutSide: "top",
        route: "/announcements",
      },
    ],
  },
  {
    id: "calendar",
    label: "Calendar",
    route: "/calendar",
    steps: [
      {
        id: "calendar.nav",
        targetAttr: "tour-nav-calendar",
        title: "Team calendar",
        description:
          "View and create events visible to everyone or specific teams.",
        popoutSide: "right",
        route: "/calendar",
        skipOnMobile: true,
      },
      {
        id: "calendar.view",
        targetAttr: "tour-calendar-view",
        title: "Events at a glance",
        description: "Browse upcoming events by day, week or month.",
        popoutSide: "top",
        route: "/calendar",
      },
    ],
  },
  {
    id: "absences",
    label: "Absences",
    route: "/absences",
    steps: [
      {
        id: "absences.nav",
        targetAttr: "tour-nav-absences",
        title: "Absences",
        description:
          "Request and track vacation, sick days, and personal time.",
        popoutSide: "right",
        route: "/absences",
        skipOnMobile: true,
      },
      {
        id: "absences.list",
        targetAttr: "tour-absences-list",
        title: "Your absence requests",
        description: "Submit a new request and track its approval status here.",
        popoutSide: "top",
        route: "/absences",
      },
    ],
  },
  {
    id: "chat",
    label: "Chat",
    route: "/chat",
    steps: [
      {
        id: "chat.nav",
        targetAttr: "tour-nav-chat",
        title: "Team messaging",
        description:
          "Direct messages and group conversations with your colleagues.",
        popoutSide: "right",
        route: "/chat",
        skipOnMobile: true,
      },
      {
        id: "chat.list",
        targetAttr: "tour-chat-list",
        title: "Your conversations",
        description: "Start a new chat or pick up where you left off.",
        popoutSide: "right",
        route: "/chat",
      },
    ],
  },
  {
    id: "directory",
    label: "Directory",
    route: "/directory",
    steps: [
      {
        id: "directory.nav",
        targetAttr: "tour-nav-directory",
        title: "People directory",
        description:
          "Find colleagues, see their role, department, and start a chat.",
        popoutSide: "right",
        route: "/directory",
        skipOnMobile: true,
      },
      {
        id: "directory.grid",
        targetAttr: "tour-directory-grid",
        title: "Browse your team",
        description:
          "Search by name, filter by department, and connect instantly.",
        popoutSide: "top",
        route: "/directory",
      },
    ],
  },
  {
    id: "guidebooks",
    label: "Guidebooks",
    route: "/guidebooks",
    steps: [
      {
        id: "guidebooks.nav",
        targetAttr: "tour-nav-guidebooks",
        title: "Guidebooks",
        description:
          "SOPs, case search, and team knowledge — all in one place.",
        popoutSide: "right",
        route: "/guidebooks",
        skipOnMobile: true,
      },
      {
        id: "guidebooks.list",
        targetAttr: "tour-guidebooks-list",
        title: "Your knowledge base",
        description:
          "Open any guide to follow step-by-step procedures or search across topics.",
        popoutSide: "top",
        route: "/guidebooks",
      },
    ],
  },
  {
    id: "notifications",
    label: "Notifications",
    route: "/notifications",
    steps: [
      {
        id: "notifications.bell",
        targetAttr: "tour-notifications-btn",
        title: "Notification bell",
        description:
          "The bell turns active when something needs your attention.",
        popoutSide: "bottom",
        route: "/notifications",
      },
      {
        id: "notifications.feed",
        targetAttr: "tour-notifications-feed",
        title: "All notifications",
        description:
          "Absence approvals, new announcements, and system alerts collected here.",
        popoutSide: "top",
        route: "/notifications",
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    route: "/settings",
    steps: [
      {
        id: "settings.nav",
        targetAttr: "tour-nav-settings",
        title: "Your settings",
        description:
          "Personalise your profile, change your language, and pick a theme.",
        popoutSide: "right",
        route: "/settings",
        skipOnMobile: true,
      },
      {
        id: "settings.profile",
        targetAttr: "tour-settings-profile",
        title: "Profile card",
        description:
          "Keep your name, job title, and contact details up to date so colleagues can find you.",
        popoutSide: "bottom",
        route: "/settings",
      },
    ],
  },
  {
    id: "admin",
    label: "Admin Panel",
    route: "/admin",
    managerOnly: true,
    steps: [
      {
        id: "admin.nav",
        targetAttr: "tour-nav-admin",
        title: "Admin panel",
        description:
          "Manage your team: invite members, approve access requests, and adjust roles.",
        popoutSide: "right",
        route: "/admin",
        skipOnMobile: true,
      },
      {
        id: "admin.members",
        targetAttr: "tour-admin-members",
        title: "Member management",
        description:
          "The Members tab lets you change roles, manage teams, suspend, or remove users.",
        popoutSide: "top",
        route: "/admin",
      },
    ],
  },
  {
    id: "activity",
    label: "Activity Tracking",
    route: "/admin/activity",
    managerOnly: true,
    steps: [
      {
        id: "activity.nav",
        targetAttr: "tour-nav-activity",
        title: "Activity tracking",
        description:
          "Monitor device activity, employee states, and generate reports for your fleet.",
        popoutSide: "right",
        route: "/admin/activity",
        skipOnMobile: true,
      },
      {
        id: "activity.stats",
        targetAttr: "tour-activity-stats",
        title: "Fleet overview",
        description:
          "Live counts show who's active, idle, or offline across all tracked devices.",
        popoutSide: "bottom",
        route: "/admin/activity",
      },
    ],
  },
];

export const ALL_CHECKPOINT_IDS = TOUR_CHECKPOINTS.map(c => c.id);
