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
