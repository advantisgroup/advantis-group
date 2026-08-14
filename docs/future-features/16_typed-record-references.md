# Typed record references

Several tables link out to "another record somewhere in the intranet" using
a free-text URL and label instead of an actual `v.id(...)` reference. That's
fine for external links, but for links that point at another intranet
record it means no referential integrity, no rich preview, and no way to
show the reverse direction ("referenced by 3 tickets") — because the
system storing the link has no idea what's on the other end.

- **`itTickets.relatedLinks` and `errorMeasures.relatedLinks`** both store
  `{ type, label, url }`, where `type` is already a closed union
  (`"guidebook" | "announcement" | "error_measure" | "ticket" | "other"`)
  but the target itself is just a URL string. Since the type is already
  known at write time, storing the actual target id per type (a small
  discriminated union: `{ type: "guidebook", guidebookId }`, etc.) instead
  of a bare `url` would let the ticket/measure UI render a live title,
  status badge, and dead-link check instead of an opaque link — and would
  let the guidebook/announcement side show "linked from" backlinks.
- **`notifications.link` is a free-text string.** Every notification's
  deep link is opaque to the notification system itself, which is part of
  why the existing "actionable notification grouping" idea
  (`docs/intranet-management-feature-ideas.md`) has to infer urgency from
  `type` alone. A typed `{ kind, id }` reference alongside (or instead of)
  the string would let the notification list render richer previews per
  kind and let a record know how many unread notifications point at it.
- **`wikiEntries.link` is a free-text string**, used for wiki entries that
  are really just a pointer elsewhere. Where that "elsewhere" is another
  intranet record, the same typed-reference treatment applies.
