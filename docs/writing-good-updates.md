# Writing good Updates

Updates get emailed to every employee and sit in a banner at the top of
every page — the bar for publishing one is "this actually affects people,"
and the bar for the writing is "readable in 5 seconds from the banner, and
still useful if someone opens the full page."

## Picking a type

- **Incident** — something is broken or degraded right now. Has a status
  (investigating → identified → monitoring → resolved) and a timeline of
  follow-ups. Publish as soon as you know something is wrong, even before
  you know the cause — "investigating" is a legitimate first post.
- **Maintenance** — planned, expected downtime or degradation. Publish
  ahead of the window, not after. Set `startedAt` to when the window
  actually begins, not when you're announcing it.
- **Changelog** — a shipped change worth telling people about. Not every
  commit; only things a non-technical employee would notice or care about
  (a new feature, a workflow change, something that used to be broken and
  now isn't). This is what replaced the old "What's new" popup — it should
  read like release notes, not a commit log.

If it doesn't affect people using the product day-to-day, it's probably not
an Update — that's what `/announcements` (general company posts) is for.

## Title

Specific, not clever. Say what's affected and what's happening.

- Good: "Files/OneDrive uploads failing", "Scheduled maintenance: Chat, Sat
  2am–4am", "Faster file uploads"
- Avoid: "Heads up!", "Important notice", "Update #47"

## Summary (the banner text)

One sentence, ~140 characters, no jargon. This is the *only* text most
people will ever read — they'll see it in the banner and decide whether to
click. Front-load the actual impact.

- Good: "Uploads to Files/OneDrive are currently failing for some users —
  we're investigating."
- Avoid restating the title with no new information: "There is an
  incident with Files/OneDrive."

## Body

- Incidents/maintenance: what's affected, what people should do in the
  meantime (if anything), and — once known — what caused it. Skip internal
  debugging detail that isn't useful to a general audience; save that for
  a postmortem elsewhere if one is warranted.
- Changelog: lead with the "what changed" in plain language, then details
  if useful. A short bullet list of the concrete, user-visible changes
  beats a paragraph of narrative.

## Timeline posts (incidents/maintenance)

Short, present-tense, one update per real change in status — not a
running commentary. "Investigating" the moment you start looking is fine;
you don't need to wait for certainty. Always post a "resolved" close-out,
even if it's brief ("Fixed — uploads are working normally again.") — that's
what clears the banner's resolved-grace window for everyone who saw it.

## Affected systems

Use the predefined list where it fits (`Intranet`, `Files/OneDrive`,
`Chat`, `Absences/Clockodo`, `Email`, `Calendar`, `Directory`,
`Guidebooks`, `Integrations`) so filtering on `/updates` stays useful.
Free-text tags are there for the genuine exception, not as a default.

## Audience

Default to "everyone." Scope to a department only when the thing you're
describing is genuinely specific to that department's tools/workflow — a
narrowly-scoped incident that actually affects everyone (e.g. company-wide
email) should still go to "everyone," not the department that happened to
report it first.
