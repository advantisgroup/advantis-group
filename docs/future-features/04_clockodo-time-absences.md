# Clockodo time & absences

Ideas for the time-tracking and absence surfaces (`/clockodo`, `/calendar`,
`/absences`).

- **Overtime balance tracker** — a visual weekly/monthly trend of accrued
  overtime per person.
- **Absence approval chain visualization** — show who has approved/is
  pending on a request. Not buildable on today's data: `approvalDelegations`
  only records temporary approval *authority* (who covers whom while away),
  and the Clockodo absence DTO (`apps/api/src/routes/clockodo-absences.ts`)
  only exposes the request's current aggregate status, not a history of who
  acted on it. A per-request approval-history record would need to become a
  prerequisite (written at the point of approval/denial) before this is
  buildable.
- **Team absence heatmap** — a calendar heatmap view of who's out this
  month, complementing the current list view.
- **Forgot-to-clock-out reminders** — a scheduled cron that nudges someone
  who left an entry open past a reasonable hour.
