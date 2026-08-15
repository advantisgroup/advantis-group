# Applicants, HR & onboarding

Ideas for the recruiting pipeline (`/applicants`) and the employee
lifecycle around it (onboarding, offboarding, HR records).

- **Interview scheduling with calendar sync** — extend
  `applicants/termine` to sync directly with the intranet calendar.
- **New-hire onboarding checklist** — a per-person tracker for tasks,
  IT provisioning, and documents, feeding into `humanResources.ts` (related
  to the new-starter checklist already noted in
  `intranet-management-feature-ideas.md`).
- **Offboarding automation** — extend `offboarding.ts` with automated
  OneDrive/device revocation triggers via `apps/api`, on top of the
  checklist visibility that already exists.
- **Referral tracking** — let an employee refer a candidate and track the
  referral against the resulting `applicants` record.
- **Pipeline SLA alerts** — proactively notify when a candidate has been
  stuck in a stage too long, building on `applicant-pipeline-health.ts`.
