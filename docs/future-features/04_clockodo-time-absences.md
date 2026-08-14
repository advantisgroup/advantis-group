# Clockodo time & absences

Ideas for the time-tracking and absence surfaces (`/clockodo`, `/calendar`,
`/absences`), distinct from ActivityTrack's Clockodo *entry* polling.

- **Overtime balance tracker** — a visual weekly/monthly trend of accrued
  overtime per person.
- **Absence approval chain visualization** — show who has approved/is
  pending on a request, building on `approvalDelegations`.
- **Team absence heatmap** — a calendar heatmap view of who's out this
  month, complementing the current list view.
- **Forgot-to-clock-out reminders** — a scheduled cron that nudges someone
  who left an entry open past a reasonable hour.
