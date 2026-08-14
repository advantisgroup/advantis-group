# Audit trail unification

Nearly every module has grown its own audit log table, each with its own
actor/target/timestamp shape: `auditLog`, `activityAuditLog`,
`applicantAuditLog`, `passwordResetAuditLog`, `onedriveAudit`,
`integrationsAuditLog`, `passkeyAuditLog`, `itTicketStatusHistory`, and
`clockodoWebhookLog`. Each one is reasonable in isolation, but there is no
single place to answer "what did this admin/user do across the whole
intranet" — today that means visiting up to nine different admin pages.

- **First slice: a read-only merged view, not a schema migration.** A
  Convex query that fans out across the existing audit tables filtered by
  `actorUserId`/time range and returns one normalized, sorted list — reusing
  `admin/audit`'s existing UI shell — gets most of the value (one search box,
  one timeline) without touching how any module writes its own audit rows.
- **Payoff**: tracing "everything this person touched last week" (useful
  for offboarding review, incident follow-up, or just understanding a
  support request) stops requiring institutional knowledge of which of the
  nine tables to check.
