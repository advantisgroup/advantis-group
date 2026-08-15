# apps/api integrations

Ideas for new server-to-server integrations living in `apps/api`, following
the existing pattern of relaying webhooks/polling into Convex behind a
server key (as done today for Clockodo and Genesys).

- **Calendar sync (Outlook/Google)** — publish absences and interview
  scheduling to an external calendar. For interviews this can follow the
  usual relay pattern, but absences can't: `AGENTS.md` is explicit that
  Clockodo is the sole source of truth for absences and there is
  deliberately no stored Convex mirror — every read fetches Clockodo fresh
  through `apps/api`. Calendar publishing has to read from that same live
  API at send time, not from a synced/mirrored copy, or it reintroduces the
  stale-mirror problem that pattern was removed to avoid.
- **Chat platform relay** — post to Slack/Teams when a new announcement or
  update is published.
- **SSO/SCIM provisioning** — a provisioning endpoint if a new identity
  provider is added alongside Clerk.
