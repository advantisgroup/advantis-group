# Org & taxonomy linking

`departments`/`teams` are the canonical org structure, and
`orgDataMigrationReview` exists specifically to migrate free-text
department/team strings on `users` into real rows. That migration hasn't
fully reached every table that stores an org label, which means some
tables can't be rolled up, filtered, or safely renamed the way `users` now
can.

- **`employeeProfiles.department` is still a free-text string**, not a
  `v.id("departments")`, even though the canonical `departments` table
  already exists and `users` has already been migrated onto it. HR records
  can't be grouped by real department, and renaming a department in admin
  silently stops matching old HR notes.
- **`audienceValidator`'s `"department"` and `"mixed"` cases still carry
  string department names** (`{ kind: "department", department: string }`,
  and `mixed.departments: string[]`) alongside the newer `"departmentId"`
  case. Announcements/events/updates built with the older or "mixed" shape
  silently stop resolving anyone if that department is later renamed —
  the exact failure mode `orgDataMigrationReview` was built to prevent
  elsewhere. Migrating these two cases onto `departmentId` (or dropping them
  once no live rows use them) closes the last gap in that migration.
- **`itTickets.category` stores only a name string**, with no `categoryId`
  at all — unlike `errorReports`, which stores both `categoryId` and a
  `categoryName` snapshot (so a deleted category still reads back, but a
  live category can still be joined/renamed safely). Giving `itTickets` the
  same `categoryId` + snapshot pattern it already uses elsewhere in the
  codebase would let ticket triage filter/report by category reliably
  instead of by exact string match.
