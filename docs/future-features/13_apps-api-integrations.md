# apps/api integrations

Ideas for new server-to-server integrations living in `apps/api`, following
the existing pattern of relaying webhooks/polling into Convex behind a
server key (as done today for Clockodo and Genesys).

- **Calendar sync (Outlook/Google)** — sync absences and interview
  scheduling with an external calendar, mirroring the Clockodo relay
  pattern.
- **Chat platform relay** — post to Slack/Teams when a new announcement or
  update is published.
- **SSO/SCIM provisioning** — a provisioning endpoint if a new identity
  provider is added alongside Clerk.
