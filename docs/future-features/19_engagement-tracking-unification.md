# Engagement-tracking unification

"Has this person seen/dismissed this thing" is tracked by at least three
independent, differently-shaped systems, each built for one content type:
`announcementReads` (announcement + user → readAt), `updateDismissals` +
`updateEmailRecipients` (updates), and `notifications.readAt` (per-user
notification rows). None of them share a schema, so a feature like "show me
everything across the intranet I haven't acknowledged yet" currently has no
single query to run — it would need three separate ones hand-merged in the
frontend.

- **First slice: a small shared `contentReads` shape** (`contentType`,
  `contentId`, `userId`, `readAt`) that new content-read tracking adopts
  going forward, without migrating the existing three tables off their
  current shape immediately.
- **Payoff**: a single "unread across the intranet" indicator, and the
  read-receipt/acknowledgment features already proposed per-module
  (`05_announcements-wiki-guidebooks.md`'s read-confirmed announcements,
  guidebook freshness) become one reusable primitive instead of three
  separate implementations.
