import type { Dict } from "./types";

// English fallback. Keep keys in sync with de.ts.
export const en: Dict = {
  "app.name": "ActivityTrack",
  "app.tagline": "Team activity at a glance",
  "nav.overview": "Overview",
  "nav.devices": "Devices",
  "nav.people": "People",
  "nav.reports": "Reports",
  "nav.users": "Users & roles",
  "nav.audit": "Audit log",
  "nav.settings": "Settings",
  "nav.signout": "Sign out",
  "lang.label": "Language",
  "theme.toDark": "Dark mode",
  "theme.toLight": "Light mode",
  "role.it_admin": "IT admin",
  "role.manager": "Manager",
  "role.viewer": "Viewer",

  "login.heading": "Sign in",
  "login.signupHeading": "Create account",
  "login.email": "Email",
  "login.password": "Password",
  "login.submit": "Sign in",
  "login.signupSubmit": "Register",
  "login.toSignup": "No account yet? Register",
  "login.toSignin": "Already have an account? Sign in",
  "login.error": "Sign-in failed. Please check your details.",
  "login.firstUserNote":
    "The first account to register automatically becomes IT admin.",
  "login.passwordHint": "Minimum 8 characters.",
  "login.feature.insights":
    "Activity patterns at a glance — charts instead of endless lists.",
  "login.feature.privacy":
    "Active/idle timing only — no screenshots, no keystrokes.",

  "overview.heading": "Team overview",
  "overview.empty": "No approved devices yet. Approve one under “Devices”.",
  "overview.working": "Working",
  "overview.idleNow": "Idle",
  "overview.offline": "Offline",
  "overview.todayActive": "active today",
  "overview.unassigned": "Unassigned",
  "overview.lastSeen": "Last seen",
  "overview.total": "Devices total",
  "overview.ofTotal": "of {total} devices",

  "devices.heading": "Devices",
  "devices.pending": "Pending approval",
  "devices.all": "All devices",
  "devices.host": "Computer",
  "devices.user": "User",
  "devices.formerUsers": "formerly:",
  "devices.status": "Status",
  "devices.person": "Person",
  "devices.lastSeen": "Last seen",
  "devices.actions": "Actions",
  "devices.approve": "Approve",
  "devices.disable": "Disable",
  "devices.delete": "Delete",
  "devices.link": "Link",
  "devices.none": "—",
  "status.pending": "Pending",
  "status.active": "Active",
  "status.disabled": "Disabled",

  "people.heading": "People",
  "people.add": "Add person",
  "people.name": "Name",
  "people.email": "Email",
  "people.active": "Active",
  "people.save": "Save",
  "people.delete": "Delete",
  "people.cancel": "Cancel",
  "people.confirmDelete": "Really delete this person?",
  "people.empty": "No people added yet.",
  "people.employeeId": "Employee ID",
  "people.genesysId": "Genesys ID",
  "people.clockodoId": "Clockodo ID",
  "people.idsHint":
    "Links the person to Genesys and Clockodo for the fused live state.",

  "users.heading": "Users & roles",
  "users.email": "Email",
  "users.name": "Name",
  "users.role": "Role",

  "audit.heading": "Audit log",
  "audit.when": "When",
  "audit.actor": "User",
  "audit.action": "Action",
  "audit.target": "Target",
  "audit.empty": "No entries yet.",

  "settings.heading": "Settings",
  "settings.subtitle":
    "Configuration, system health, users and the audit log in one place.",
  "settings.tabs.config": "Configuration",
  "settings.tabs.system": "System health",
  "settings.tabs.users": "Users",
  "settings.tabs.audit": "Audit log",
  "settings.config.heading": "Configuration",
  "settings.config.hint":
    "Controls when someone counts as inactive, when a device is offline, and how long data is kept.",
  "settings.config.inactivity": "Inactivity threshold",
  "settings.config.inactivityHint":
    "Idle time before someone counts as inactive (used in charts and KPIs).",
  "settings.config.offline": "Offline threshold",
  "settings.config.offlineHint":
    "Time without a heartbeat before a device shows as offline.",
  "settings.config.retention": "Data retention",
  "settings.config.retentionHint":
    "How long raw samples and state history are kept before pruning.",
  "settings.config.seconds": "seconds",
  "settings.config.days": "days",
  "settings.config.save": "Save configuration",
  "settings.config.saved": "Configuration saved.",
  "settings.config.invalid": "Please fill in every field.",
  "settings.debugPw.heading": "Tracker debug password",
  "settings.debugPw.hint":
    "Sets the password that unlocks the tracker UI on the PCs.",
  "settings.debugPw.set": "Password is set.",
  "settings.debugPw.unset": "No password set yet.",
  "settings.debugPw.new": "New password",
  "settings.debugPw.save": "Save password",
  "settings.debugPw.saved": "Password saved.",
  "settings.debugPw.tooShort": "At least 6 characters.",
  "settings.access.heading": "Access control",
  "settings.access.hint":
    "Choose which email domains may sign in to the dashboard.",
  "settings.access.placeholder": "example.com, company.com",
  "settings.access.note":
    "Comma-separated. Anyone with one of these domains can sign in as a viewer. Empty means admins only.",
  "settings.access.save": "Save domains",
  "settings.access.saved": "Access list saved.",
  "settings.access.adminsLabel": "Administrators",
  "settings.access.adminsHint":
    "Set via the ACTIVITYTRACK_ADMIN_EMAILS server environment variable — always full access.",
  "settings.access.noAdmins":
    "None set — the first person to sign in becomes admin automatically.",

  "timeline.heading": "Timeline",
  "timeline.back": "Back to overview",
  "timeline.time": "Time",
  "timeline.state": "State",
  "timeline.idle": "Idle",
  "timeline.empty": "No samples available.",
  "timeline.kpi.activeToday": "Active today",
  "timeline.kpi.idleToday": "Idle today",
  "timeline.kpi.activeOn": "Active {date}",
  "timeline.kpi.idleOn": "Idle {date}",
  "timeline.kpi.status": "Status",
  "timeline.kpi.lastSeen": "Last seen",
  "timeline.trend.heading": "Last 14 days",
  "timeline.trend.sub": "Active vs idle hours per day.",
  "timeline.intraday.heading": "Across the day",
  "timeline.intraday.sub": "Share of active samples over time.",
  "timeline.intraday.series": "Active %",
  "timeline.heatmap.heading": "Activity by time of day",
  "timeline.heatmap.sub": "When this person was active today.",
  "timeline.hourly.heading": "State by hour (today)",
  "timeline.hourly.sub":
    "Minutes per hour by state — idle, on a call, break, wrap-up.",
  "timeline.hourly.empty":
    "No state history for today yet. Data appears as signals arrive.",
  "timeline.hourly.unlinked":
    "This device isn't linked to a person with integrations.",
  "timeline.state.heading": "Current state",
  "timeline.state.empty": "No state data for this person yet.",
  "timeline.tabs.charts": "Overview",
  "timeline.tabs.raw": "Raw data",
  "timeline.tabs.day": "Day detail",
  "timeline.tabs.export": "Export",
  "timeline.day.heading": "Minute by minute",
  "timeline.day.sub": "What happened at each point of the selected day.",
  "timeline.day.date": "Day",
  "timeline.day.empty": "No state history for this day.",
  "timeline.day.now": "now",
  "timeline.day.viewingPast": "You're viewing data for {date} — not today.",
  "timeline.day.backToToday": "Back to today",
  "timeline.day.noDataToday": "No activity recorded today yet.",
  "timeline.day.rewind": "View last active day ({date})",

  "reports.title": "Weekly reports",
  "reports.subtitle":
    "Weekly active/idle time across every device, with filtering and time frames.",
  "reports.timeframe": "Time frame",
  "reports.tf.thisWeek": "This week",
  "reports.tf.lastWeek": "Last week",
  "reports.tf.last4Weeks": "Last 4 weeks",
  "reports.tf.thisMonth": "This month",
  "reports.tf.custom": "Custom",
  "reports.filter": "Filter",
  "reports.filterAll": "All devices",
  "reports.col.person": "Person / device",
  "reports.col.active": "Active",
  "reports.col.idle": "Idle",
  "reports.col.total": "Total",
  "reports.empty":
    "No data for this period. Try a wider time frame or a different device.",
  "reports.trend.heading": "Weekly trend",
  "reports.trend.sub": "Active and idle hours per week.",
  "timeline.export.heading": "Export data",
  "timeline.export.sub":
    "This person's activity for a date range, as CSV or JSON.",
  "timeline.export.from": "From",
  "timeline.export.to": "To",
  "timeline.export.csv": "Download CSV",
  "timeline.export.json": "Download JSON",
  "timeline.export.done": "Export downloaded.",
  "timeline.export.failed": "Export failed. Please try again.",
  "timeline.online": "Online",
  "timeline.offline": "Offline",

  "common.loading": "Loading …",
  "common.active": "Active",
  "common.idle": "Idle",
  "common.forbidden": "You do not have permission to view this.",
  "common.copy": "Copy",
  "common.copied": "Copied!",
  "common.copyFailed": "Couldn't copy to clipboard.",
  "common.search": "Search …",
  "common.noResults": "No matches.",
  "footer.privacy":
    "Privacy: ActivityTrack records activity timing only (active/idle) on company-owned devices — no screenshots, no keystrokes. Staff are informed.",

  "devices.slots.heading": "Enrollment Codes",
  "devices.slots.create": "New Code",
  "devices.slots.label": "Label (optional)",
  "devices.slots.labelPlaceholder": "e.g. “For John Smith’s PC”",
  "devices.slots.expiry": "Valid for",
  "devices.slots.expiry24": "24 hours",
  "devices.slots.expiry48": "48 hours",
  "devices.slots.expiry7d": "7 days",
  "devices.slots.cancel": "Cancel",
  "devices.slots.copy": "Copy",
  "devices.slots.copied": "Copied!",
  "devices.slots.revoke": "Revoke",
  "devices.slots.confirmRevoke": "Really revoke this enrollment code?",
  "devices.slots.status.active": "Active",
  "devices.slots.status.used": "Used",
  "devices.slots.status.expired": "Expired",
  "devices.slots.status.revoked": "Revoked",
  "devices.slots.expires": "Expires",
  "devices.slots.usedAt": "Used",
  "devices.slots.empty": "No codes yet. Create one to enroll a new device.",
  "devices.slots.note":
    "Add this code to the tracker’s config.json — it will be used automatically on first launch.",
  "devices.slots.heading.devices": "All Devices",
  "devices.filter.search": "Search …",
  "devices.filter.all": "All statuses",
  "devices.empty": "No devices yet. Approve one once its tracker enrolls.",
  "devices.noMatches": "No devices match these filters.",
  "devices.confirmDelete": "Permanently delete this device?",
  "devices.confirmDeleteBody":
    "This removes the device and revokes its token. It will have to re-enroll from scratch. To pause it reversibly, use Disable instead.",

  "users.roleUpdated": "Role updated.",
  "people.updated": "Saved.",
  "people.deleted": "Person deleted.",
  "devices.approved": "Device approved.",
  "devices.disabled": "Device disabled.",
  "devices.deleted": "Device deleted.",
  "devices.linked": "Person linked.",
  "devices.slotRevoked": "Code revoked.",

  "nav.health": "System health",

  // Live employee state (workstation + Genesys + Clockodo fusion).
  "nav.state": "Live state",
  "state.heading": "Live state",
  "state.subtitle": "Fused status from workstation, Genesys and Clockodo.",
  "state.empty": "No state data yet. Signals will appear here as they arrive.",
  "state.updated": "Updated",
  "state.signals": "Signals",
  "state.source.agent": "Workstation",
  "state.source.genesys": "Genesys",
  "state.source.clockodo": "Clockodo",
  "state.idleFor": "idle for {duration}",
  "state.health.unavailable": "{source} unavailable: {reason}",
  "state.health.unconfigured": "{source} is not configured.",
  "state.health.degraded":
    "This signal is currently ignored. The remaining sources still drive the state.",
  "empstate.ABSENT": "Absent",
  "empstate.BREAK": "Break",
  "empstate.IN_CALL": "On call",
  "empstate.WRAP_UP": "Wrap-up",
  "empstate.ACTIVE": "Active",
  "empstate.IDLE": "Idle",

  // Error toasts — shown when an action fails. Keyed by the backend error code.
  "error.generic": "Something went wrong. Please try again.",
  "error.network": "Can't reach the server. Please try again shortly.",
  "error.auth.required": "Please sign in again.",
  "error.auth.forbidden": "You don't have permission to do that.",
  "error.notFound.device":
    "That device was not found (it may have been removed).",
  "error.notFound.person": "That person was not found.",
  "error.notFound.user": "That user was not found.",
  "error.notFound.slot": "That code was not found.",
  "error.notFound.event": "That entry was not found.",
  "error.validation.password_short":
    "The password must be at least 6 characters.",
  "error.validation.out_of_range": "That value is outside the allowed range.",
  "error.user.cannot_demote_self": "You can't remove your own IT admin role.",

  // System health page.
  "health.heading": "System health",
  "health.subtitle": "Device connectivity and reported issues at a glance.",
  "health.allGood.title": "All systems normal",
  "health.allGood.body":
    "Every device is reporting and there are no open issues.",
  "health.attention.title": "{count} thing(s) need attention",
  "health.attention.body": "See the breakdown below.",
  "health.offline.heading": "Devices that have gone quiet",
  "health.offline.lastSeen": "Last seen {time}",
  "health.offline.for": "offline for {duration}",
  "health.offline.unassigned": "Unassigned device",
  "health.issues.heading": "Reported issues",
  "health.issues.none": "No open issues.",
  "health.issues.occurrences": "{count}×",
  "health.issues.lastAt": "last {time}",
  "health.resolve": "Resolve",
  "health.resolved": "Marked as resolved.",
  "health.detail.heading": "Technical detail (IT only)",
  "health.detail.toggleOpen": "Open only",
  "health.detail.toggleAll": "Show all",
  "health.detail.severity": "Severity",
  "health.detail.event": "Event",
  "health.detail.message": "Message",
  "health.detail.source": "Source",
  "health.detail.device": "Device",
  "health.detail.count": "Count",
  "health.detail.lastAt": "Last",
  "health.detail.status": "Status",
  "health.detail.empty": "No events logged.",
  "health.detail.statusOpen": "Open",
  "health.detail.statusResolved": "Resolved",
  "health.sev.info": "Info",
  "health.sev.warning": "Warning",
  "health.sev.error": "Error",
  "health.sev.critical": "Critical",
  "health.src.backend": "Server",
  "health.src.tracker": "Device",
  "health.src.dashboard": "Dashboard",

  // Plain-language descriptions per event code (for non-technical viewers).
  "health.friendly.ingest.unauthorized":
    "An unknown or blocked device tried to send data.",
  "health.friendly.ingest.bad_payload": "A device sent malformed data.",
  "health.friendly.enroll.unauthorized":
    "An unauthorized install tried to register.",
  "health.friendly.enroll.code_invalid":
    "An invalid or expired enrollment code was used.",
  "health.friendly.tracker.send_failed":
    "A computer can't reach the server to send data.",
  "health.friendly.tracker.enroll_failed": "A computer's initial setup failed.",
  "health.friendly.tracker.queue_io":
    "A computer can't buffer its data locally.",
  "health.friendly.dashboard.crash": "The dashboard hit an unexpected error.",
  "health.friendly.unknown": "An issue was reported.",

  // ErrorBoundary fallback.
  "errorBoundary.title": "Something went wrong",
  "errorBoundary.body":
    "This area couldn't be loaded. The problem was automatically reported to IT.",
  "errorBoundary.retry": "Try again",

  // Auth provisioning gate (user row could not be created/loaded).
  "auth.error.title": "Couldn't finish signing you in",
  "auth.error.body":
    "We couldn't load your account. Please check your connection and try again.",
  "auth.error.not_allowed":
    "Your account isn't permitted to access this dashboard. Contact your administrator.",
  "auth.error.domain_not_allowed":
    "Your email domain isn't allowed. Contact your administrator.",
  "auth.error.retry": "Try again",

  // Help / FAQ, status tooltips, setup checklist, guardrail confirms.
  "nav.help": "Help",
  "nav.more": "More",

  "help.title": "Help & FAQ",
  "help.subtitle": "Common questions and fixes — search or browse by topic.",
  "help.search": "Search help…",
  "help.noResults": "No matching help articles.",
  "help.deviceStatus.pending":
    "Waiting for an admin to approve this device before its data is counted.",
  "help.deviceStatus.active": "Approved and reporting normally.",
  "help.deviceStatus.disabled":
    "Turned off by an admin — it no longer reports or counts.",

  "faq.section.access": "Sign-in & access",
  "faq.section.tracker": "The desktop tracker",
  "faq.section.integrations": "Integrations",
  "faq.section.general": "General",

  "faq.scope.desktop": "Desktop tracker",
  "faq.scope.dashboard": "Dashboard",
  "faq.scope.both": "Both",

  "faq.q.signin_denied": "Someone can't sign in to the dashboard",
  "faq.a.signin_denied":
    "Access is decided by email. Add their email domain under Settings → Access, or add their exact address to the permanent admins (ACTIVITYTRACK_ADMIN_EMAILS in Convex). They get in on their next sign-in attempt.",
  "faq.q.domain": "How do I let a whole company domain sign in?",
  "faq.a.domain":
    "Settings → Access → add the domain (e.g. example.com). Everyone with that email domain can sign in as a viewer; promote individuals under Settings → Users.",
  "faq.q.roles": "What can each role do?",
  "faq.a.roles":
    "Viewer: read-only dashboards. Manager: also add/edit people and link devices. IT admin: everything, including users, access, device approval and settings.",
  "faq.q.add_admin": "How do I make someone a permanent admin?",
  "faq.a.add_admin":
    "Permanent admins are pinned in the ACTIVITYTRACK_ADMIN_EMAILS Convex env var and can never be locked out. Set at least one boss's email there. Anyone else can be promoted under Settings → Users.",
  "faq.q.not_reporting": "A computer isn't showing up / not reporting",
  "faq.a.not_reporting":
    "Check: (1) the tracker is installed and running (system tray), (2) the device appears under Devices and is Approved (pending devices don't count), (3) the computer has internet. New installs appear as 'pending' until you approve them.",
  "faq.q.offline": "Someone shows as offline but they're at their desk",
  "faq.a.offline":
    "A device goes 'offline' after it misses heartbeats for the offline window (Settings → Configuration). Causes: the PC is asleep, off the network, or the tracker was closed. It clears itself once the tracker reports again.",
  "faq.q.enroll_failed": "The tracker says enrollment failed",
  "faq.a.enroll_failed":
    "The one-time enrollment code is wrong, already used, or expired. Create a fresh code under Devices → enrollment codes and put it in the device's config (or reinstall with a current code).",
  "faq.q.debug_password": "What is the tracker debug password?",
  "faq.a.debug_password":
    "It unlocks the tracker's local status/diagnostics window on a PC. Set or change it under Settings → Configuration. It never unlocks the dashboard — only the on-device debug view.",
  "faq.q.integration_down":
    "An integration (Genesys / Clockodo) shows as unavailable",
  "faq.a.integration_down":
    "Usually expired or missing API credentials, or the provider is unreachable. Check the integration's keys in the Convex environment variables. The dashboard keeps working from workstation activity alone while an integration is down.",
  "faq.q.clockodo_setup": "How do I connect the Clockodo webhook?",
  "faq.a.clockodo_setup":
    "Point Clockodo's webhook at /api/webhooks/clockodo. On first save Clockodo sends a validation secret, which is logged once in the deploy logs — paste that value into Clockodo's 'Token' field to finish.",
  "faq.q.privacy": "What exactly is recorded?",
  "faq.a.privacy":
    "Only activity timing — whether the PC is active or idle, and for how long. No screenshots, no keystrokes, no clipboard, no file contents. It detects input timing, not input data.",
  "faq.q.retention": "How long is data kept?",
  "faq.a.retention":
    "Raw samples are pruned after the retention window (Settings → Configuration, default 90 days). Daily totals are kept indefinitely, so historical reports survive even after raw samples are deleted.",
  "faq.q.add_person": "How do I add a coworker and link their computer?",
  "faq.a.add_person":
    "People → add the person. Then Devices → open the device and link it to that person. After linking, the dashboard shows their name instead of the hostname.",
  "faq.q.approve_device": "A new device is stuck on 'pending'",
  "faq.a.approve_device":
    "New installs auto-register as pending so nothing is tracked without your say-so. Open Devices and approve it; its activity starts counting from approval.",

  "health.fix.tracker.send_failed":
    "The tracker couldn't reach the backend. Usually a temporary network drop — it retries automatically and keeps the data. If it persists, check that PC's internet and the Convex URL.",
  "health.fix.tracker.queue_io":
    "The tracker couldn't write its local buffer (disk full or a locked ProgramData folder). Check free disk space on that PC.",
  "health.fix.ingest.bad_tz_offset":
    "A device reported an impossible timezone; the backend clamped it. Harmless unless it repeats — then check that PC's clock/timezone settings.",
  "health.fix.enroll.code_invalid":
    "A tracker tried to enroll with a bad or expired code. Issue a fresh enrollment code under Devices.",
  "health.fix.api.internal_error":
    "The dashboard's server hit an unexpected error (often a missing/invalid integration credential or secret). Check the integration settings; details are in the deploy logs.",
  "health.fix.unknown":
    "See the technical detail below, or the Help page. If it keeps happening, contact your administrator.",

  "setup.title": "Finish setting up",
  "setup.subtitle": "A few steps to get ActivityTrack fully running.",
  "setup.remaining": "{count} left",
  "setup.item.access": "Configure who can sign in (admins or allowed domains)",
  "setup.item.approve": "Approve at least one device",
  "setup.item.people": "Add the people you're tracking",
  "setup.item.link": "Link a device to a person",
  "setup.item.debugpw": "Set the tracker debug password",

  "users.confirmRole": "Change this user's role?",
  "users.confirmRoleBody":
    "{email} will become {role}. This changes what they can see and do immediately.",
  "users.confirmRoleConfirm": "Change role",

  "error.user.last_admin":
    "You can't demote the last IT admin — promote another admin first.",
};
