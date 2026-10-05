# Zeiterfassung (own time tracking) — build spec

Status: approved by Vahan Hovhannisyan (IT) on 2026-10-05, from the
management questionnaire. Replaces Clockodo for **working time and
absences only** (no projects/customers/billing).

## Rollout

1. Build the module next to the existing Clockodo integration. Route:
   `/zeiterfassung`. Until cutover it stays locked for non-admins through
   `apps/intranet/src/lib/maintenance.ts` (do **not** add it to
   `OPEN_PREFIXES`).
2. Import from Clockodo (separate task): remaining vacation per person,
   overtime balance as opening balance, and the last 2 years of entries
   (legal retention).
3. Cutover on a first of a month: open `/zeiterfassung` to everyone, point
   nav + header clock at it, redirect `/clockodo/*`, then remove the
   Clockodo integration.

## Roles

Only two roles matter here:

- **Admin** (`caller.isAdmin`): sees and edits everyone, approves
  absences and corrections, manages schedules, allowances, holidays,
  month locks, exports.
- **Everyone else** (employee, manager, custom roles): sees and edits only
  their own data. Managers get no extra rights in this module.

Enforce on the server (Convex builders / `ctx.caller`), not only in the UI.

## Rules (decided)

| Topic         | Rule                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clocking      | Start / stop in the browser (header control + page). Breaks are clocked as separate pause segments. No phone/NFC clocking for now.                                                                                                                                                                                                                                                                                              |
| Location      | Not recorded.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 18:00 rule    | At 18:00 Europe/Berlin every still-open work entry is closed automatically: end = start of the day's first work segment + that person's regular daily hours for that weekday (from their schedule), minus time already booked in earlier closed segments that day. Mark `autoClosed: true`, notify the person (in-app notification) with a hint to correct it via a correction request. Admins see auto-closed entries flagged. |
| Breaks        | Only a **warning**, never auto-deducted: > 6 h work → 30 min break required, > 9 h → 45 min (ArbZG §4). Also warn on > 10 h/day and < 11 h rest between days.                                                                                                                                                                                                                                                                   |
| Corrections   | Employees may add/edit/delete their own entries for past days (not today's running entry) → saved as **pending correction**, admin approves or rejects. Approved corrections apply; the original stays in the audit log.                                                                                                                                                                                                        |
| Month lock    | A month locks automatically on the **15th of the following month, 00:00 Europe/Berlin**. After that no one but an admin (with an explicit unlock + reason) can change it.                                                                                                                                                                                                                                                       |
| Overtime      | Running **hours account** (Stundenkonto): worked − target, cumulative, with an opening balance per person (from import). No payout/expiry logic.                                                                                                                                                                                                                                                                                |
| Target hours  | Per person schedule with `validFrom` date and minutes per weekday (Mon–Sun), so part-time and contract changes work. Default for new people: 8 h Mon–Fri (40 h). Admin editable.                                                                                                                                                                                                                                                |
| Vacation      | 24 days/year default (full-time), per-person override per year. Half days allowed. Unused days carry over and **expire on 31 March** of the following year.                                                                                                                                                                                                                                                                     |
| Absence types | Vacation (needs admin approval), Sick (entered by the employee, auto-approved, admin notified), Special leave and Other (need approval). Half-day flag on first/last day.                                                                                                                                                                                                                                                       |
| Holidays      | Bavarian public holidays (Nürnberg). Company rules on top: **24.12. and 31.12. half days**, **15.08. full day off**. Store holidays in a table seeded per year, admin-editable. Holidays don't consume vacation and reduce target hours.                                                                                                                                                                                        |
| Visibility    | Employees see only their own times. Team calendar shows **only vacation** of others (like today's privacy rule), never sick/other.                                                                                                                                                                                                                                                                                              |
| "Im Büro"     | Directory status `inOffice` returns: true while the person has an open (clocked-in, not paused) work entry.                                                                                                                                                                                                                                                                                                                     |
| Audit         | Every create/update/delete/approve/lock/unlock writes an append-only audit row (who, when, before, after, reason). Never hard-delete entries; deleting = tombstone. Retain ≥ 2 years.                                                                                                                                                                                                                                           |

## Data model (Convex, new `tables/time.ts`)

- `timeEntries`: userId, kind (`work` | `break`), start, end?, source
  (`clock` | `manual` | `auto18` | `import`), status (`active` |
  `pending` | `rejected` | `deleted`), autoClosed?, note?, correctionOf?
  (id of the entry a pending correction replaces), createdBy, updatedAt.
  Indexes by user+start, by status, by end (open entries).
- `workSchedules`: userId, validFrom (YYYY-MM-DD), minutesPerWeekday
  (7 numbers).
- `absences`: userId, type, startDate, endDate, halfDayStart, halfDayEnd,
  status (`pending` | `approved` | `rejected` | `cancelled`), note,
  decidedBy?, decidedAt?. (Table name may need a new name because an old
  `absences` table with legacy data exists in prod — use
  `timeAbsences`.)
- `vacationAllowances`: userId, year, days, carriedOver, carriedOverExpires.
- `timeBalances`: userId, openingMinutes, openingDate (for import).
- `holidays`: date, name, fraction (1 or 0.5), region.
- `monthLocks`: month (YYYY-MM), lockedAt, unlockedBy?, reason?.
- `timeAuditLog`: actorId, subjectUserId, entity, entityId, action,
  before, after, reason, at.

Computations (target per day, worked per day, balance, remaining
vacation) live in pure functions in `convex/time/lib/*` with unit tests.

## Pages (`/zeiterfassung`)

- **Übersicht**: clock in/out/pause button, today's segments, this week
  target vs actual, hours-account balance, remaining vacation, warnings.
- **Arbeitszeiten**: day/week/month list, add/edit (→ correction request
  for past days), flags for warnings and auto-closed entries, CSV export
  of own data.
- **Abwesenheiten**: request vacation/special/other, enter sick days, own
  list with status, cancel pending.
- **Kalender/Planer**: month view of team vacation (privacy rule above).
- **Admin** (admins only): approvals (absences + corrections), people
  overview (balance, vacation, today status), per-person schedule /
  allowance / opening balance editor, holidays editor, month locks,
  audit log view, CSV export per person/month.

The header clock control gets a variant backed by this module, switched
on at cutover.

## Crons

- 18:00 Europe/Berlin daily: auto-close open entries (18:00 rule).
- 15th of each month 00:05 Europe/Berlin: lock previous month.
- 1 April 00:10: expire carried-over vacation from the previous year.
- Yearly 1 Dec: seed next year's holidays (Bavaria + company rules).

Convex cron schedules are UTC — handle CET/CEST correctly (e.g. run hourly
and act when it is the target local hour).

## Out of scope for now

Projects/customers, billing, NFC/phone clocking, automatic break
deduction, location, payroll export (DATEV).

## Implementation notes (2026-10-05, branch `zeiterfassung`)

Built as specified; where the spec left room:

- **18:00 rule** — runs hourly; an open work entry is due at the first 18:00
  Berlin after its start (an entry started after 18:00 closes the next day).
  End = open entry's start + (regular hours for the weekday − work already
  booked in earlier closed segments that day) + breaks taken inside it,
  clamped between the start and 18:00 — i.e. "first start + regular hours"
  for the usual single entry. A break still open at 18:00 ends with it. The
  entry gets `source: "auto18"`, `autoClosed: true`, an audit row and an
  in-app notification.
- **Breaks** count for the ArbZG check as explicit pause segments plus gaps
  between work segments, each only from 15 minutes (§ 4 ArbZG). Warnings
  only; nothing is deducted.
- **Corrections** — any manual change by a non-admin (add, edit, delete of a
  closed entry, any past day or today) is a pending row; approving an edit
  tombstones the original (`deleted`) and activates the request, so both
  stay readable beside the audit row. Admin changes apply directly the same
  way. The running entry can't be edited, only clocked out.
- **Absences** — sick days and anything an admin enters are approved at
  once; employees can withdraw pending requests; admins can cancel approved
  ones. All approved types reduce target hours; only vacation uses the
  allowance. Others see only approved vacation in the team calendar.
- **Vacation** — no allowance row = 24 days. In January a job opens each
  active person's new year with last year's remainder as carry-over;
  vacation up to 31 March uses carry-over first; from 1 April the unused
  rest lapses (recorded on the row).
- **Month lock** — time-based (15th of the next month, 00:00 Berlin), so it
  holds even if the job is late; the job writes a `monthLocks` row and caches
  the month's totals. Admin unlock needs a reason; locking again wins.
- **Holidays** — seeded idempotently (this year if missing, next year from
  1 December, or via the admin button). Seeding fills in missing dates even
  in locked months; editing a holiday respects the lock.
- **Hours account** counts from the opening date (else the first schedule or
  entry) up to yesterday.

### Test mode (before go-live)

Convex env `TIME_MODE` anything but `live` (default: unset) = test mode:
only the emails in `TIME_TESTERS` may call `time.*` (admins included — the
others get the maintenance screen and no sidebar item), admin notifications
go to the testers, the directory's "Im Büro" stays empty, and a banner offers
"Testdaten löschen" (`time.mode.purgeTestData`, everything except holidays,
refused once live).

### Cutover checklist

0. Delete the test data (banner button), then set Convex env
   `TIME_MODE=live`.

1. Run the Clockodo import (separate task): per person `setOpeningBalance`
   (minutes + cutover date), `setAllowance` for the current year
   (entitlement + carry-over), entries with `source: "import"` and
   absences; then `time.admin.recomputeTotals` per person to cache the
   locked months.
2. Seed holidays for the current and next year (Verwaltung → Feiertage).
3. Set each part-timer's schedule (default is 8 h Mon–Fri).
4. `apps/intranet/src/lib/maintenance.ts`: add `/zeiterfassung` to
   `OPEN_PREFIXES`; `lib/pages.ts`: drop `visible: admin` from the
   `/zeiterfassung*` entries.
5. `AppShell.tsx`: drop `ClockodoHeaderControl` — `TimeClockHeaderControl`
   and the morning `ClockInPrompt` are already mounted for everyone
   `time.mode.status` lets in.
6. Sidebar: drop the Clockodo item; dashboard/calendar/directory "out today"
   should read `time.absences.calendar` instead of `useAbsencesCalendar`.
7. Redirect `/clockodo/*` to the matching `/zeiterfassung/*` page, then remove
   the Clockodo integration (apps/api routes, `lib/absences-api.ts`,
   `lib/clockodo-*`, `components/clockodo`, `users.clockodoUserId`).
